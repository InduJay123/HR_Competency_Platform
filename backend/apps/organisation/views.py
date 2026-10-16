from django.db.models import BooleanField, Case, Q, Value, When
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.services import record
from common.permissions import membership, require_hr

from .models import Department, EmployeeProfile, JobRole
from .serializers import (
    DepartmentSerializer,
    EmployeeCreateSerializer,
    EmployeeSerializer,
    JobRoleSerializer,
    reject_reporting_fields,
)
from .services import create_employee


class EmployeeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        member = membership(self.request, suspended_access="account" if self.action == "photo" else None)
        qs = EmployeeProfile.objects.select_related("membership__user").filter(
            company=member.company, membership__user__is_superuser=False
        )
        if not member.company.active:
            # Account recovery permits only this membership's own photo.
            qs = qs.filter(membership=member)
        if not member.is_hr or (
            self.action == "list" and self.request.query_params.get("include_inactive") != "true"
        ):
            qs = qs.filter(membership__active=True)
        if not member.is_hr:
            qs = qs.filter(membership=member)
        if self.request.query_params.get("search"):
            term = self.request.query_params["search"][:150]
            qs = qs.filter(
                Q(membership__user__first_name__icontains=term)
                | Q(membership__user__last_name__icontains=term)
                | Q(membership__user__email__icontains=term)
            )
        if self.request.query_params.get("scope") == "team":
            qs = qs.exclude(membership=member) if member.is_head_hr else qs.none()
        if self.action != "photo":
            qs = qs.defer("avatar_data").annotate(
                has_avatar=Case(
                    When(avatar_data__isnull=False, then=Value(True)),
                    default=Value(False),
                    output_field=BooleanField(),
                )
            )
        return qs.order_by("membership__user__first_name", "id")

    @action(detail=True, methods=["get"])
    def photo(self, request, pk=None):
        from django.http import Http404, HttpResponse

        obj = self.get_object()
        if obj.membership.user.profile_picture_storage_path:
            from apps.accounts.photo import picture_response
            return picture_response(obj.membership.user)
        if not obj.avatar_data:
            raise Http404()
        response = HttpResponse(bytes(obj.avatar_data), content_type="image/png")
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @action(detail=True, methods=["post"])
    def invite(self, request, pk=None):
        from rest_framework.exceptions import ValidationError

        from apps.accounts.tasks import queue_access_email

        member = membership(request)
        require_hr(member)
        obj = self.get_object()
        if not obj.membership.active:
            raise ValidationError("Restore Steward Guy access before sending an invitation.")
        if not queue_access_email(str(obj.membership.user_id)):
            raise ValidationError("Email delivery is unavailable. Try again when the worker is healthy.")
        record(member, "employee.invitation_queued", obj)
        return Response({"message": "Access invitation queued for delivery."}, status=202)

    def create(self, request):
        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = create_employee(membership(request), serializer.validated_data)
        return Response(EmployeeSerializer(obj).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        from django.db import transaction
        from rest_framework.exceptions import ValidationError

        from common.exceptions import Conflict

        from .services import related

        member = membership(request)
        require_hr(member)
        obj = self.get_object()

        class Changes(serializers.Serializer):
            version = serializers.IntegerField(min_value=1)
            designation = serializers.CharField(max_length=160, required=False, allow_blank=True)
            joined_on = serializers.DateField(required=False, allow_null=True)
            department = serializers.UUIDField(required=False, allow_null=True)
            job_role = serializers.UUIDField(required=False, allow_null=True)
            senior_leader = serializers.BooleanField(required=False)
            active = serializers.BooleanField(required=False)

        reject_reporting_fields(request.data)
        data = Changes(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            from apps.companies.models import Company

            Company.objects.select_for_update().get(pk=member.company_id)
            obj = EmployeeProfile.objects.select_for_update().get(pk=obj.id)
            values = data.validated_data
            if values["version"] != obj.version:
                raise Conflict()
            if values.get("active") is False and obj.membership.is_head_hr:
                raise ValidationError("Transfer Chief Steward responsibility before deactivation.")
            if values.get("active") is False:
                from apps.reviews.models import Review

                if (
                    obj.membership_id == member.id
                    or Review.objects.filter(company=member.company)
                    .exclude(state="FINALISED")
                    .filter(Q(employee=obj) | Q(manager=obj) | Q(reviewer=obj.membership))
                    .exists()
                ):
                    raise ValidationError(
                        "Cannot deactivate yourself or a participant in an unfinished review."
                    )
            for k in ["designation", "joined_on", "senior_leader"]:
                if k in values:
                    setattr(obj, k, values[k])
            for k, model in [("department", Department), ("job_role", JobRole)]:
                if k in values:
                    setattr(obj, k, related(model, member.company_id, values[k]))
            for k in ["active"]:
                if k in values:
                    setattr(obj.membership, k, values[k])
            obj.membership.save()
            obj.version += 1
            obj.save()
            record(member, "employee.updated", obj)
        return Response(EmployeeSerializer(obj).data)



class OrganisationViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return self.queryset.filter(company=membership(self.request).company).order_by("name")

    def perform_create(self, serializer):
        member = membership(self.request)
        require_hr(member)
        obj = serializer.save(company=member.company)
        record(member, "organisation.created", obj)

    def perform_update(self, serializer):
        member = membership(self.request)
        require_hr(member)
        obj = serializer.save()
        record(member, "organisation.updated", obj)


class DepartmentViewSet(OrganisationViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer


class JobRoleViewSet(OrganisationViewSet):
    queryset = JobRole.objects.all()
    serializer_class = JobRoleSerializer
