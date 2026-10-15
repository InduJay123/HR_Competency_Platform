import io
import warnings
from pathlib import Path

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import Http404, HttpResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.evidence import storage
from apps.organisation.models import EmployeeProfile
from apps.organisation.serializers import SelfProfileSerializer
from common.exceptions import Conflict
from common.permissions import membership


def picture_response(user):
    key = user.profile_picture_storage_path
    if not key or key != f"users/{user.id}/avatar.png":
        raise Http404()
    response = HttpResponse(storage.get(key, bucket="profile-pictures"), content_type="image/png")
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


class ProfilePhotoView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        return picture_response(request.user)

    def post(self, request):
        # Identity always comes from the authenticated session, never form data.
        member = None
        if request.session.get("company_id") and not request.user.is_superuser:
            member = membership(request)
        photo = request.FILES.get("photo")
        formats = {".jpg": ("JPEG", "image/jpeg"), ".jpeg": ("JPEG", "image/jpeg"),
                   ".png": ("PNG", "image/png"), ".webp": ("WEBP", "image/webp")}
        expected = formats.get(Path(photo.name).suffix.lower()) if photo else None
        if not photo or not photo.size or photo.size > 5 * 1024 * 1024 or not expected:
            raise ValidationError("Choose a non-empty JPG, PNG or WEBP image up to 5 MB.")
        if photo.content_type != expected[1]:
            raise ValidationError("The image content type does not match its filename.")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(photo) as source:
                    if source.format != expected[0] or source.width * source.height > 10_000_000:
                        raise ValueError()
                    source.load()
                    avatar = ImageOps.fit(ImageOps.exif_transpose(source).convert("RGB"), (256, 256))
                    clean = io.BytesIO()
                    avatar.save(clean, format="PNG")
        except (
            ValueError,
            OSError,
            UnidentifiedImageError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ):
            raise ValidationError(
                "This image cannot be used. Choose a JPG, PNG or WEBP up to 10 megapixels."
            ) from None
        with transaction.atomic():
            user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
            profile = None
            if member:
                profile = EmployeeProfile.objects.select_for_update().get(membership=member)
                if str(profile.version) != str(request.data.get("version")):
                    raise Conflict()
            key = f"users/{user.id}/avatar.png"
            storage.put(key, clean.getvalue(), "image/png", bucket="profile-pictures", upsert=True)
            user.profile_picture_storage_path = key
            user.profile_picture_version += 1
            user.save(update_fields=["profile_picture_storage_path", "profile_picture_version"])
            # Clear old binary/external references across this user's memberships.
            EmployeeProfile.objects.filter(membership__user=user).update(avatar_data=None, photo_url="")
            if profile:
                profile.avatar_data = None
                profile.photo_url = ""
                profile.version += 1
                profile.save()
                profile.membership.user = user
                record(member, "profile.photo_updated", profile)
                return Response(SelfProfileSerializer(profile).data)
        return Response({"photo_url": user.profile_picture_url})
