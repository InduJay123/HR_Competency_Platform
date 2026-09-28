import io
import warnings

from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from PIL import Image, ImageOps
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import membership, require_hr

from .models import Company


class CompanyLogoView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        company = get_object_or_404(Company, pk=pk, active=True)
        if not company.logo_data:
            raise Http404()
        result = HttpResponse(bytes(company.logo_data), content_type="image/png")
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
        company.logo_data = output.getvalue()
        # Same-origin URL; the public image is also used on this company's sign-in screen.
        from django.conf import settings

        origin = settings.FRONTEND_URL.rstrip("/")
        company.logo_url = f"{origin}/api/v1/company-logo/{company.id}/"
        company.save(update_fields=["logo_data", "logo_url", "updated_at"])
        return Response({"logo_url": company.logo_url})
