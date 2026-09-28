import uuid

from django.db import models


class Entity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TenantEntity(Entity):
    company = models.ForeignKey("companies.Company", on_delete=models.PROTECT)

    class Meta:
        abstract = True
