from django.conf import settings
from django.db import models

from common.models import TenantEntity


class AuditLog(TenantEntity):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    action = models.CharField(max_length=100)
    object_id = models.CharField(max_length=64)
    metadata = models.JSONField(default=dict)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["company", "created_at"])]
