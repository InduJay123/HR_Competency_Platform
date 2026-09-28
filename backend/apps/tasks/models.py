from django.db import models

from common.models import TenantEntity


class WorkItem(TenantEntity):
    class Status(models.TextChoices):
        ASSIGNED = "ASSIGNED", "Assigned"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        BLOCKED = "BLOCKED", "Blocked"
        DONE = "DONE", "Done"
        CANCELLED = "CANCELLED", "Cancelled"

    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    expected_outcome = models.TextField()
    type = models.CharField(
        max_length=20, choices=[("WORK", "Work"), ("DEVELOPMENT", "Development")], default="WORK"
    )
    assigned_by = models.ForeignKey(
        "organisation.EmployeeProfile", on_delete=models.PROTECT, related_name="assigned_work"
    )
    accountable_owner = models.ForeignKey(
        "organisation.EmployeeProfile", on_delete=models.PROTECT, related_name="accountable_work"
    )
    assigned_to = models.ForeignKey(
        "organisation.EmployeeProfile", on_delete=models.PROTECT, related_name="work"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    priority = models.CharField(
        max_length=10, choices=[("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High")], default="MEDIUM"
    )
    due_date = models.DateField()
    completed_at = models.DateTimeField(null=True)
    parent_task = models.ForeignKey("self", on_delete=models.PROTECT, null=True, related_name="children")
    version = models.PositiveIntegerField(default=1)

    class Meta:
        indexes = [
            models.Index(fields=["company", "assigned_to", "status"]),
            models.Index(fields=["company", "due_date"]),
        ]


class WorkUpdate(TenantEntity):
    task = models.ForeignKey(WorkItem, on_delete=models.PROTECT, related_name="updates")
    status = models.CharField(max_length=20, choices=WorkItem.Status.choices)
    notes = models.TextField(blank=True)
    blocker = models.TextField(blank=True)
    next_step = models.TextField(blank=True)
    result = models.TextField(blank=True)
    submitted_by = models.ForeignKey("companies.Membership", on_delete=models.PROTECT)

    class Meta:
        ordering = ["created_at"]
