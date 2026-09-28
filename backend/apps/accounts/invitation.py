from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.db import transaction
from django.utils.decorators import method_decorator
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.csrf import csrf_protect
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .views import LoginThrottle


@method_decorator(csrf_protect, name="dispatch")
class InvitationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        class Input(serializers.Serializer):
            uid = serializers.CharField(max_length=256)
            token = serializers.CharField(max_length=256)
            accept = serializers.BooleanField(default=False)
            first_name = serializers.CharField(max_length=150, required=False)
            last_name = serializers.CharField(max_length=150, required=False)
            password = serializers.CharField(max_length=256, trim_whitespace=False, required=False)
            confirm_password = serializers.CharField(max_length=256, trim_whitespace=False, required=False)

        form = Input(data=request.data)
        form.is_valid(raise_exception=True)
        data = form.validated_data
        with transaction.atomic():
            try:
                user = (
                    get_user_model()
                    .objects.select_for_update()
                    .get(pk=urlsafe_base64_decode(data["uid"]).decode(), is_active=True)
                )
            except (ValueError, UnicodeDecodeError, get_user_model().DoesNotExist):
                raise ValidationError("This invitation is invalid or expired. Ask HR to resend it.")
            if user.has_usable_password() or not default_token_generator.check_token(user, data["token"]):
                raise ValidationError("This invitation is invalid or expired. Ask HR to resend it.")
            member = (
                user.membership_set.filter(active=True, company__active=True)
                .select_related("company")
                .first()
            )
            if not member:
                raise ValidationError("No active workspace is available for this invitation.")
            if not data["accept"]:
                return Response(
                    {
                        "email": user.email,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                        "company": member.company.name,
                    }
                )
            if not data.get("first_name") or not data.get("last_name"):
                raise ValidationError("Enter your first and last name.")
            if not data.get("password") or data["password"] != data.get("confirm_password"):
                raise ValidationError("Both passwords must match.")
            validate_password(data["password"], user)
            user.first_name = data["first_name"]
            user.last_name = data["last_name"]
            user.set_password(data["password"])
            user.save(update_fields=["first_name", "last_name", "password"])
            return Response({"message": "Invitation accepted. Sign in to start your onboarding."})
