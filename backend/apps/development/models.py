from django.db import models

from common.models import TenantEntity


class Commitment(TenantEntity):
    review = models.ForeignKey("reviews.Review", on_delete=models.PROTECT, related_name="commitments")
    employee = models.ForeignKey("organisation.EmployeeProfile", on_delete=models.PROTECT)
    owner = models.ForeignKey(
        "organisation.EmployeeProfile", on_delete=models.PROTECT, related_name="owned_commitments"
    )
    action = models.TextField()
    manager_support = models.TextField()
    success_measure = models.TextField()
    due_date = models.DateField()
    status = models.CharField(
        max_length=20,
        default="NOT_STARTED",
        choices=[
            ("NOT_STARTED", "Not started"),
            ("IN_PROGRESS", "In progress"),
            ("SUPPORT_NEEDED", "Support needed"),
            ("COMPLETE", "Complete"),
        ],
    )
    work_item = models.ForeignKey("tasks.WorkItem", on_delete=models.PROTECT, null=True)
    version = models.PositiveIntegerField(default=1)


class CommitmentUpdate(TenantEntity):
    commitment = models.ForeignKey(Commitment, on_delete=models.PROTECT, related_name="updates")
    author = models.ForeignKey("companies.Membership", on_delete=models.PROTECT)
    notes = models.TextField()
    status = models.CharField(max_length=20)
    evidence = models.ManyToManyField("evidence.EvidenceItem")
