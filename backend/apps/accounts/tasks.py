from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
import logging

logger = logging.getLogger(__name__)


def queue_access_email(user_id):
    try:
        if settings.DEBUG:
            deliver_access_email.run(user_id)
        else:
            deliver_access_email.delay(user_id)

    except Exception as exc:
        logger.exception(
            "Access email delivery failed: %s",
            exc,
        )
        return False

    return True


@shared_task(bind=True, max_retries=2)
def deliver_access_email(self, user_id):
    from .services import send_access_email

    user = get_user_model().objects.filter(
        id=user_id,
        is_active=True,
    ).first()

    if not user:
        return

    if settings.DEBUG:
        # Local development: do not retry through Celery.
        send_access_email(user)
        return

    try:
        send_access_email(user)
    except Exception as exc:
        raise self.retry(
            exc=RuntimeError("Access email delivery unavailable"),
            countdown=30,
        ) from exc