from django.db import models

from common.models import TenantEntity


class EvidenceItem(TenantEntity):
    task = models.ForeignKey("tasks.WorkItem", on_delete=models.PROTECT, related_name="evidence")
    uploaded_by = models.ForeignKey("companies.Membership", on_delete=models.PROTECT)
    title = models.CharField(max_length=180)
    kind = models.CharField(max_length=10, choices=[("NOTE", "Note"), ("LINK", "Link"), ("FILE", "File")])
    note = models.TextField(blank=True)
    link = models.URLField(blank=True)
    storage_key = models.CharField(max_length=300, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    sha256 = models.CharField(max_length=64, blank=True)
    size = models.PositiveIntegerField(default=0)
    validation = models.CharField(
        max_length=12,
        choices=[("PENDING", "Pending"), ("VALIDATED", "Validated"), ("EXCLUDED", "Excluded")],
        default="PENDING",
    )
    validated_by = models.ForeignKey(
        "companies.Membership", on_delete=models.PROTECT, null=True, related_name="validated_evidence"
    )
    validated_at = models.DateTimeField(null=True)
    authorised_excerpt = models.TextField(blank=True)
    validation_reason = models.TextField(blank=True)
