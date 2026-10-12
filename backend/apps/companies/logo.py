import io
import re
import uuid
import warnings

from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from PIL import Image, ImageOps
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import membership, require_hr
from apps.evidence import storage

from .models import Company


class CompanyLogoView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        company = get_object_or_404(Company, pk=pk, active=True)
        if company.logo_storage_path:
            # Never let a corrupted reference turn this public route into a storage proxy.
            if not re.fullmatch(
                rf"{company.id}/logo-[0-9a-f]{{32}}\.png", company.logo_storage_path
            ):
                raise Http404()
            content = storage.get(company.logo_storage_path, bucket="company-logos")
        elif company.logo_data:
            content = bytes(company.logo_data)
        else:
            raise Http404()
        result = HttpResponse(content, content_type="image/png")
        result["X-Content-Type-Options"] = "nosniff"
        result["Cache-Control"] = "no-cache"
        return result

    def post(self, request, pk):
        member = membership(request)
        require_hr(member)
        if str(member.company_id) != str(pk):
            raise PermissionDenied()
        photo = request.FILES.get("logo")
        if not photo or photo.size > 2 * 1024 * 1024:
            raise ValidationError("Choose a PNG or JPEG under 2 MB. Transparent PNG is recommended.")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(photo) as source:
                    if source.format not in ["PNG", "JPEG"] or source.width * source.height > 10000000:
                        raise ValueError()
                    source.load()
                    logo = ImageOps.exif_transpose(source).convert("RGBA")
                    logo.thumbnail((800, 400))
                    output = io.BytesIO()
                    logo.save(output, format="PNG")
        except (ValueError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise ValidationError(
                "The image could not be read. Use a PNG or JPEG up to 10 megapixels."
            ) from None
        company = member.company
        key = f"{company.id}/logo-{uuid.uuid4().hex}.png"
        storage.put(key, output.getvalue(), "image/png", bucket="company-logos")
        company.logo_storage_path = key
        company.save(update_fields=["logo_storage_path", "updated_at"])
        return Response({"logo_url": company.display_logo_url})
