from .development import *  # noqa: F403

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CELERY_TASK_ALWAYS_EAGER = True
from urllib.parse import urlsplit
ALLOWED_HOSTS = [*ALLOWED_HOSTS, urlsplit(ADMIN_FRONTEND_URL).hostname]
