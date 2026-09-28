from rest_framework import serializers, viewsets
from rest_framework.exceptions import PermissionDenied

from apps.audit.services import record
from common.permissions import membership, require_hr

from .models import Company


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "slug",
            "tagline",
            "logo_url",
            "active",
            "stewardship_code",
            "nature",
            "country",
            "market",
            "declared_employees",
            "mission",
            "vision",
            "website",
            "created_at",
            "approved_at",
        ]
        read_only_fields = ["stewardship_code", "created_at", "approved_at", "market", "declared_employees"]


class CompanyViewSet(viewsets.ModelViewSet):
    serializer_class = CompanySerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if self.request.user.is_superuser:
            return Company.objects.order_by("name")
        return Company.objects.filter(id=membership(self.request).company_id)

    def perform_create(self, serializer):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Platform administrator access required.")
        serializer.save()

    def perform_update(self, serializer):
        member = membership(self.request)
        require_hr(member)
        if "active" in serializer.validated_data or "slug" in serializer.validated_data:
            raise PermissionDenied("Tenant identity changes require platform administration.")
        obj = serializer.save()
        record(member, "company.updated", obj)
