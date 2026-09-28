from .base import *  # noqa: F403

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "local-only-change-this-before-deployment"
)  # noqa: F405

DEBUG = True

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

PRIVATE_STORAGE_BACKEND = os.environ.get(
    "PRIVATE_STORAGE_BACKEND",
    "local"
)  # noqa: F405

# Local development: run Celery tasks immediately.
# No Redis or Celery worker required.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "cache+memory://"