from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.views import LoginThrottle

from .models import Company


class BrandingView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def get(self, request, slug):
        company = get_object_or_404(Company, slug=slug, active=True)
        return Response(
            {
                "name": company.name,
                "tagline": company.tagline,
                "logo_url": company.logo_url,
                "slug": company.slug,
            }
        )
