from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.views import LoginThrottle
from apps.organisation.models import EmployeeProfile
from common.exceptions import Conflict
from common.permissions import membership, require_hr

from .models import AccessRequest, Company, Membership, PlatformEvent


class RequestInput(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["COMPANY", "EMPLOYEE"])
    email = serializers.EmailField()
    password = serializers.CharField(max_length=256, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.RegexField(r"^[+0-9() .-]{0,32}$", allow_blank=True, required=False)
    designation = serializers.CharField(max_length=160)
    company_code = serializers.CharField(max_length=24, required=False)
    company_name = serializers.CharField(max_length=180, required=False)
    nature = serializers.CharField(max_length=180, required=False)
    country = serializers.CharField(max_length=100, required=False)
    market = serializers.ChoiceField(choices=["SL", "REGIONAL", "GLOBAL"], required=False)
    employee_count = serializers.IntegerField(min_value=1, max_value=10000000, required=False)
    website = serializers.URLField(required=False, allow_blank=True)
    joined_on = serializers.DateField(required=False, allow_null=True)


class RequestSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.get_full_name", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, default="")

    class Meta:
        model = AccessRequest
        fields = [
            "id",
            "kind",
            "status",
            "name",
            "email",
            "company",
            "company_name",
            "details",
            "decision_note",
            "created_at",
            "decided_at",
        ]


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        incoming = RequestInput(data=request.data)
        incoming.is_valid(raise_exception=True)
        data = incoming.validated_data.copy()
        email, password = data.pop("email").lower(), data.pop("password")
        kind = data.pop("kind")
        company = None
        if kind == "EMPLOYEE":
            company = Company.objects.filter(
                stewardship_code=data.get("company_code", "").upper(), active=True
            ).first()
            if not company:
                raise ValidationError("Enter the active stewardship code supplied by your company HR.")
        else:
            for key in ["company_name", "nature", "country", "market", "employee_count"]:
                if not data.get(key):
                    raise ValidationError({key: "This field is required for a company request."})
        if data.get("joined_on"):
            if data["joined_on"] > timezone.localdate():
                raise ValidationError("Employment joining date cannot be in the future.")
            data["joined_on"] = data["joined_on"].isoformat()
        User = get_user_model()
        try:
            with transaction.atomic():
                user = User.objects.select_for_update().filter(email__iexact=email).first()
                if user:
                    if authenticate(request, username=user.username, password=password) is None:
                        raise ValidationError(
                            "Unable to submit this request. Use your existing account password or recover access."
                        )
                    if user.is_superuser:
                        raise ValidationError("Platform administrators cannot request employee membership.")
                else:
                    user = User(
                        username=email,
                        email=email,
                        first_name=data["first_name"],
                        last_name=data["last_name"],
                    )
                    try:
                        validate_password(password, user)
                    except DjangoValidationError as exc:
                        raise ValidationError({"password": exc.messages}) from None
                    user.set_password(password)
                    user.save()
                if AccessRequest.objects.filter(
                    user=user, company=company, kind=kind, status="PENDING"
                ).exists():
                    raise ValidationError("Your request is already pending. Sign in to view its status.")
                if company and Membership.objects.filter(user=user, company=company).exists():
                    raise ValidationError(
                        "You already have a membership. Contact your company HR about access."
                    )
                obj = AccessRequest.objects.create(user=user, company=company, kind=kind, details=data)
        except IntegrityError:
            raise ValidationError(
                "An account or request already exists. Sign in to check your access."
            ) from None
        return Response(
            {
                "id": obj.id,
                "message": "Request submitted. Sign in to track approval; workspace access starts only after approval.",
            },
            status=201,
        )


class MyRequestsView(APIView):
    def get(self, request):
        return Response(
            RequestSerializer(
                AccessRequest.objects.filter(user=request.user)
                .select_related("user", "company")
                .order_by("-created_at"),
                many=True,
            ).data
        )


class AccessRequestViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RequestSerializer

    def get_queryset(self):
        qs = AccessRequest.objects.select_related("user", "company").order_by("-created_at")
        if self.request.user.is_superuser:
            return qs.filter(kind="COMPANY")
        member = membership(self.request)
        require_hr(member)
        return qs.filter(kind="EMPLOYEE", company_id=member.company_id)

    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        obj = self.get_object()

        class Decision(serializers.Serializer):
            decision = serializers.ChoiceField(choices=["APPROVED", "REJECTED"])
            note = serializers.CharField(max_length=2000)
            role = serializers.ChoiceField(choices=["EMPLOYEE", "MANAGER", "HR"], default="EMPLOYEE")

        payload = Decision(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        if data["role"] == "HR" and not request.user.is_superuser and not membership(request).is_head_hr:
            raise PermissionDenied("Only the company Head of HR can grant HR access.")
        with transaction.atomic():
            obj = AccessRequest.objects.select_for_update().get(pk=obj.pk)
            if obj.status != "PENDING":
                raise Conflict("This request has already been decided.")
            if data["decision"] == "APPROVED":
                details = obj.details
                if obj.kind == "COMPANY":
                    company = Company.objects.create(
                        name=details["company_name"],
                        slug=f"company-{obj.id.hex}",
                        nature=details["nature"],
                        country=details["country"],
                        market=details["market"],
                        declared_employees=details["employee_count"],
                        website=details.get("website", ""),
                        approved_at=timezone.now(),
                    )
                    obj.company = company
                else:
                    company = Company.objects.select_for_update().get(pk=obj.company_id)
                    if not company.active:
                        raise ValidationError("This company is suspended.")
                member = Membership.objects.create(
                    company=company,
                    user=obj.user,
                    approved_at=timezone.now(),
                    is_hr=obj.kind == "COMPANY" or data["role"] == "HR",
                    is_head_hr=obj.kind == "COMPANY",
                    is_manager=data["role"] == "MANAGER",
                )
                EmployeeProfile.objects.create(
                    company=company,
                    membership=member,
                    designation=details["designation"],
                    phone=details.get("phone", ""),
                    joined_on=details.get("joined_on"),
                    employment_company=company.name,
                )
            obj.status = data["decision"]
            obj.decision_note = data["note"]
            obj.decided_at = timezone.now()
            obj.decided_by = request.user
            obj.save()
            PlatformEvent.objects.create(
                actor=request.user,
                company=obj.company,
                action=f"access.{obj.status.lower()}",
                details={
                    "request": str(obj.id),
                    "kind": obj.kind,
                    "note": data["note"],
                    "role": data["role"],
                },
            )
        return Response(RequestSerializer(obj).data)
