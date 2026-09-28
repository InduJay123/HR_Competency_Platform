import io
import warnings

from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.organisation.models import EmployeeProfile
from apps.organisation.serializers import SelfProfileSerializer
from common.exceptions import Conflict
from common.permissions import membership


class ProfilePhotoView(APIView):
    def post(self, request):
        member = membership(request)
        photo = request.FILES.get("photo")
        if not photo or photo.size > 2 * 1024 * 1024:
            raise ValidationError("Choose a PNG or JPEG image smaller than 2 MB.")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(photo) as source:
                    if source.format not in ["PNG", "JPEG"] or source.width * source.height > 10_000_000:
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
                "This image cannot be used. Choose a PNG or JPEG up to 10 megapixels."
            ) from None
        with transaction.atomic():
            profile = EmployeeProfile.objects.select_for_update().get(membership=member)
            if str(profile.version) != str(request.data.get("version")):
                raise Conflict()
            profile.avatar_data = clean.getvalue()
            profile.photo_url = ""
            profile.version += 1
            profile.save()
            record(member, "profile.photo_updated", profile)
        return Response(SelfProfileSerializer(profile).data)
