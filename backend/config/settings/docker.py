import os

from .production import *  # noqa: F403,F401


# Local Docker test only.
# Real production continues to use production.py.

DEBUG = False

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "backend",
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Local Docker testing uses HTTP, not HTTPS.
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Do not test HSTS locally.
SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False

# Docker Redis service.
CELERY_BROKER_URL = os.environ.get(
    "REDIS_URL",
    "redis://redis:6379/0",
)

CELERY_RESULT_BACKEND = CELERY_BROKER_URL

CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = False