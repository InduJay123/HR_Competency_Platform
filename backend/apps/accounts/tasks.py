from celery import shared_task
from django.contrib.auth import get_user_model


def queue_access_email(user_id):
    try:
        deliver_access_email.delay(user_id)
    except Exception:
        # Reset responses stay generic; infrastructure monitoring detects broker failure.
        import logging

        logging.getLogger(__name__).warning("Access email queue unavailable")
        return False
    return True


@shared_task(bind=True, max_retries=2)
def deliver_access_email(self, user_id):
    from .services import send_access_email

    user = get_user_model().objects.filter(id=user_id, is_active=True).first()
    if not user:
        return
    try:
        send_access_email(user)
    except Exception as exc:
        raise self.retry(exc=RuntimeError("Access email delivery unavailable"), countdown=30) from exc
