from django.conf import settings
from django.db import models

from common.models import TenantEntity


class Notification(TenantEntity):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    event_key = models.CharField(max_length=200)
    title = models.CharField(max_length=160)
    path = models.CharField(max_length=240)
    read_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "recipient", "event_key"], name="notification_idempotency"
            )
        ]
        indexes = [models.Index(fields=["company", "recipient", "read_at"])]
