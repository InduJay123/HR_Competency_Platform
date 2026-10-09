import os

from .base import *  # noqa: F403

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "local-only-change-this-before-deployment"
)  # noqa: F405EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
# Local development: avoid reusing stale Supabase connections.
DATABASES["default"]["CONN_MAX_AGE"] = 0
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
DATABASES["default"].setdefault("OPTIONS", {})
DATABASES["default"]["OPTIONS"]["connect_timeout"] = 10

EMAIL_HOST = os.environ.get(
    "EMAIL_HOST",
    "smtp.resend.com",
)

EMAIL_PORT = int(
    os.environ.get(
        "EMAIL_PORT",
        "587",
    )
)

EMAIL_USE_TLS = True

EMAIL_HOST_USER = os.environ.get(
    "EMAIL_HOST_USER",
    "resend",
)

EMAIL_HOST_PASSWORD = os.environ.get(
    "EMAIL_HOST_PASSWORD",
    "",
)

DEFAULT_FROM_EMAIL = os.environ.get(
    "DEFAULT_FROM_EMAIL",
    "Beyond the Finish Line <noreply@bradleyemerson.com>",
)

PRIVATE_STORAGE_BACKEND = os.environ.get(
    "PRIVATE_STORAGE_BACKEND",
    "local",
)

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "cache+memory://"