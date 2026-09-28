from .base import *  # noqa: F403

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "local-only-change-this-before-deployment")  # noqa: F405
DEBUG = True
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
PRIVATE_STORAGE_BACKEND = os.environ.get("PRIVATE_STORAGE_BACKEND", "local")  # noqa: F405
