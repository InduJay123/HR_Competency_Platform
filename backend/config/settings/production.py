import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403

if len(SECRET_KEY) < 50 or not os.environ.get("DATABASE_URL"):  # noqa: F405
    raise ImproperlyConfigured("Production requires a strong DJANGO_SECRET_KEY and DATABASE_URL.")
SESSION_COOKIE_SECURE = True
LOCAL_ADMIN_LOGIN_ENABLED = False
FRONTEND_URL = os.environ.get("FRONTEND_URL") or "https://btflplatform.com"
ADMIN_FRONTEND_URL = os.environ.get("ADMIN_FRONTEND_URL") or "https://admin.btflplatform.com"
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
# Configure forwarded-proto only behind a trusted proxy which strips client headers.
if os.environ.get("TRUST_PROXY_HTTPS") == "true":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": os.environ["REDIS_URL"]}
}
