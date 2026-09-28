from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.exceptions import ValidationError


def send_access_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    route = "reset-password" if user.has_usable_password() else "accept-invitation"
    url = f"{settings.FRONTEND_URL}/auth/{route}?uid={uid}&token={token}"
    send_mail(
        "Your workspace access",
        f"Use this link to set your password:\n{url}\nIf you did not request access, ignore this message.",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
    )


def set_password(data):
    try:
        user = get_user_model().objects.get(pk=urlsafe_base64_decode(data["uid"]).decode(), is_active=True)
    except (ValueError, UnicodeDecodeError, get_user_model().DoesNotExist):
        raise ValidationError("This access link is invalid or expired.")
    if not default_token_generator.check_token(user, data["token"]):
        raise ValidationError("This access link is invalid or expired.")
    validate_password(data["password"], user)
    user.set_password(data["password"])
    user.save(update_fields=["password"])
