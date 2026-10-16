from django.contrib.auth import authenticate, get_user_model, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.companies.models import Membership
from common.permissions import membership
from common.suspension import eligible_memberships, restricted_state, billing_suspended


class LoginThrottle(SimpleRateThrottle):
    scope = "login"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class Credentials(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(
        max_length=256,
        trim_whitespace=False,
    )
    company_slug = serializers.SlugField(
        required=False,
        allow_blank=True,
    )
    role = serializers.ChoiceField(
        choices=[
            "auto",
            "employee",
            "hr",
            "platform",
        ],
        default="auto",
    )


class SessionView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        csrf = get_token(request)

        if not request.user.is_authenticated:
            return Response(
                {
                    "authenticated": False,
                    "csrf_token": csrf,
                }
            )

        memberships = eligible_memberships(request.user)

        current = memberships.filter(
            company_id=request.session.get("company_id")
        ).first()
        context = request.session.get("context", "employee")
        if not current or context not in current.contexts:
            context = "employee"
            request.session["context"] = context

        return Response(
            {
                "authenticated": True,
                "is_platform_admin": request.user.is_superuser,
                **restricted_state(current),
                "csrf_token": csrf,
                "user": {
                    "id": request.user.id,
                    "first_name": request.user.first_name,
                    "last_name": request.user.last_name,
                    "email": request.user.email,
                    "photo_url": request.user.profile_picture_url,
                },
                "memberships": [
                    {
                        "id": m.id,
                        "company_id": m.company_id,
                        "name": m.company.name,
                        "tagline": m.company.tagline if m.company.active else "",
                        "logo_url": m.company.display_logo_url if m.company.active else "",
                        "stewardship_code": m.company.stewardship_code,
                        "mission": m.company.mission if m.company.active else "",
                        "vision": m.company.vision if m.company.active else "",
                        "contexts": m.contexts if m.company.active else [],
                        **restricted_state(m),
                    }
                    for m in memberships
                ],
                "company_id": (
                    current.company_id
                    if current
                    else None
                ),
                "context": context,
                "contexts": (
                    current.contexts
                    if current and current.company.active
                    else []
                ),
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        data = Credentials(data=request.data)
        data.is_valid(raise_exception=True)

        email = data.validated_data["email"].strip().lower()
        password = data.validated_data["password"]

        User = get_user_model()

        account = User.objects.filter(
            email__iexact=email,
            is_active=True,
        ).first()

        user = None

        if account is not None:
            user = authenticate(
                request,
                username=account.username,
                password=password,
            )

        if user is None:
            raise ValidationError(
                "Unable to sign in with these credentials."
            )

        eligible = eligible_memberships(user).order_by("-company__active", "created_at")

        role = data.validated_data["role"]

        if role == "platform" and not user.is_superuser:
            raise PermissionDenied(
                "Super-admin access is not assigned to this account."
            )

        if role == "hr":
            eligible = eligible.filter(
                is_hr=True
            )

        slug = data.validated_data.get(
            "company_slug"
        )

        if slug:
            member = eligible.filter(
                company__slug=slug
            ).first()
        else:
            member = eligible.first()

        if not member and not user.is_superuser:
            from apps.companies.models import AccessRequest

            has_request = AccessRequest.objects.filter(
                user=user
            ).exists()

            if (
                role not in ["auto", "employee"]
                or not has_request
            ):
                raise ValidationError(
                    "No approved workspace with this responsibility "
                    "is available. Check your request status using "
                    "Steward Guy sign-in."
                )

        login(request, user)

        request.session.pop(
            "company_id",
            None,
        )

        request.session.pop(
            "context",
            None,
        )

        if user.is_superuser:
            return Response(
                {
                    "authenticated": True,
                    "csrf_token": get_token(request),
                    "redirect": "/platform",
                }
            )

        selected = "employee"

        if member:
            request.session["company_id"] = str(
                member.company_id
            )

            if role in [
                "hr",
                "employee",
            ]:
                selected = role

            elif member.is_hr:
                selected = "hr"

            else:
                selected = "employee"

            request.session["context"] = selected

        return Response(
            {
                "authenticated": True,
                "csrf_token": get_token(request),
                "redirect": (
                    ("/hr/billing" if billing_suspended(member) else "/employee/account")
                    if member and not member.company.active else f"/{selected}/dashboard"
                    if member
                    else "/auth/request-status"
                ),
            }
        )


class LogoutView(APIView):
    def post(self, request):
        logout(request)

        return Response(
            {
                "authenticated": False,
            }
        )


class ContextView(APIView):
    def post(self, request):
        company = serializers.UUIDField().run_validation(
            request.data.get("company_id")
        )

        member = eligible_memberships(request.user).filter(company_id=company).first()

        context = request.data.get(
            "context"
        )

        if (
            member is None
            or context not in member.contexts
        ):
            raise PermissionDenied(
                "This organisation or responsibility "
                "is not available to you."
            )

        request.session["company_id"] = str(
            company
        )

        request.session["context"] = context

        return Response(
            {
                "company_id": company,
                "context": context,
                "contexts": member.contexts if member.company.active else [],
                **restricted_state(member),
            }
        )


class ProfileView(APIView):
    def get(self, request):
        from django.shortcuts import get_object_or_404

        from apps.organisation.models import EmployeeProfile
        from apps.organisation.serializers import SelfProfileSerializer

        profile = get_object_or_404(
            EmployeeProfile,
            membership=membership(request, suspended_access="account"),
        )

        return Response(
            SelfProfileSerializer(
                profile
            ).data
        )

    def patch(self, request):
        from django.db import transaction
        from django.utils import timezone

        from apps.audit.services import record
        from apps.organisation.models import EmployeeProfile
        from apps.organisation.serializers import SelfProfileSerializer
        from common.exceptions import Conflict

        member = membership(request, suspended_access="account")

        class ProfileInput(serializers.Serializer):
            version = serializers.IntegerField(
                min_value=1
            )

            first_name = serializers.CharField(
                max_length=150,
                required=False,
            )

            last_name = serializers.CharField(
                max_length=150,
                required=False,
            )

            photo_url = serializers.URLField(
                required=False,
                allow_blank=True,
            )

            phone = serializers.RegexField(
                r"^[+0-9() .-]{0,32}$",
                required=False,
                allow_blank=True,
            )

            contact_email = serializers.EmailField(
                required=False,
                allow_blank=True,
            )

            designation = serializers.CharField(
                max_length=160,
                required=False,
                allow_blank=True,
            )

            employment_company = serializers.CharField(
                max_length=180,
                required=False,
                allow_blank=True,
            )

            location = serializers.CharField(
                max_length=120,
                required=False,
                allow_blank=True,
            )

            bio = serializers.CharField(
                max_length=2000,
                required=False,
                allow_blank=True,
            )

            skills = serializers.CharField(
                max_length=500,
                required=False,
                allow_blank=True,
            )

            notification_digest = serializers.BooleanField(
                required=False
            )

            remove_photo = serializers.BooleanField(
                required=False
            )

            complete_onboarding = serializers.BooleanField(
                required=False
            )

        data = ProfileInput(
            data=request.data
        )

        data.is_valid(
            raise_exception=True
        )

        with transaction.atomic():
            # Match photo uploads' lock order to serialize identity changes.
            get_user_model().objects.select_for_update().get(pk=request.user.pk)
            profile = (
                EmployeeProfile.objects
                .select_for_update()
                .get(
                    membership=member
                )
            )

            if (
                profile.version
                != data.validated_data["version"]
            ):
                raise Conflict()

            for key in [
                "first_name",
                "last_name",
            ]:
                if key in data.validated_data:
                    setattr(
                        request.user,
                        key,
                        data.validated_data[key],
                    )

            request.user.save(
                update_fields=[
                    "first_name",
                    "last_name",
                ]
            )

            if "photo_url" in data.validated_data:
                profile.photo_url = (
                    data.validated_data["photo_url"]
                )

            for key in [
                "phone",
                "contact_email",
                "designation",
                "employment_company",
                "location",
                "bio",
                "skills",
                "notification_digest",
            ]:
                if key in data.validated_data:
                    setattr(
                        profile,
                        key,
                        data.validated_data[key],
                    )

            if data.validated_data.get(
                "remove_photo"
            ):
                user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
                user.profile_picture_storage_path = ""
                user.profile_picture_version += 1
                user.save(update_fields=["profile_picture_storage_path", "profile_picture_version"])
                EmployeeProfile.objects.filter(membership__user=user).update(avatar_data=None, photo_url="")
                profile.membership.user = user
                profile.avatar_data = None
                profile.photo_url = ""

            if data.validated_data.get(
                "complete_onboarding"
            ):
                profile.onboarding_completed_at = (
                    timezone.now()
                )

            profile.version += 1

            profile.save()

            record(
                member,
                "profile.updated",
                profile,
            )

        return Response(
            SelfProfileSerializer(
                profile
            ).data
        )


@method_decorator(csrf_protect, name="dispatch")
class ResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        from .tasks import queue_access_email

        email = serializers.EmailField().run_validation(
            request.data.get("email")
        )

        User = get_user_model()

        user = User.objects.filter(
            email__iexact=email,
            is_active=True,
        ).first()

        if user:
            queue_access_email(
                str(user.id)
            )

        return Response(
            {
                "message": (
                    "If this account is eligible, "
                    "an access link will be sent."
                )
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class SetPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        from .services import set_password

        data = {
            key: serializers.CharField(
                max_length=256,
                trim_whitespace=False,
            ).run_validation(
                request.data.get(key)
            )
            for key in [
                "uid",
                "token",
                "password",
            ]
        }

        set_password(data)

        return Response(
            {
                "message": (
                    "Password saved. "
                    "You can now sign in."
                )
            }
        )
