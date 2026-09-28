from django.db import models

from common.models import TenantEntity


class ReviewCycle(TenantEntity):
    year = models.PositiveIntegerField()
    kind = models.CharField(max_length=8, choices=[("MID_YEAR", "Mid-Year"), ("YEAR_END", "Year-End")])
    starts_on = models.DateField()
    ends_on = models.DateField()
    due_on = models.DateField()
    launched_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "year", "kind"], name="two_cycles_per_year"),
            models.CheckConstraint(
                condition=models.Q(kind__in=["MID_YEAR", "YEAR_END"]), name="formal_cycle_types"
            ),
            models.CheckConstraint(
                condition=models.Q(ends_on__gte=models.F("starts_on")), name="valid_cycle_period"
            ),
        ]


class Review(TenantEntity):
    cycle = models.ForeignKey(ReviewCycle, on_delete=models.PROTECT)
    employee = models.ForeignKey(
        "organisation.EmployeeProfile", on_delete=models.PROTECT, related_name="employee_reviews"
    )
    manager = models.ForeignKey(
        "organisation.EmployeeProfile", on_delete=models.PROTECT, related_name="manager_reviews"
    )
    reviewer = models.ForeignKey(
        "companies.Membership", on_delete=models.PROTECT, related_name="appointed_reviews"
    )
    prior_midyear = models.ForeignKey("self", on_delete=models.PROTECT, null=True)
    state = models.CharField(max_length=30, default="OPEN")
    round = models.PositiveIntegerField(default=1)
    version = models.PositiveIntegerField(default=1)
    conversation = models.JSONField(default=dict)
    comparison = models.JSONField(default=dict)
    hr_assessment = models.JSONField(default=dict)
    employee_ack = models.DateTimeField(null=True)
    employee_comments = models.TextField(blank=True)
    manager_ack = models.DateTimeField(null=True)
    finalised_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["cycle", "employee"], name="one_review_per_employee_cycle"),
            models.CheckConstraint(
                condition=~models.Q(employee=models.F("manager")), name="no_self_assessment"
            ),
        ]
        indexes = [models.Index(fields=["company", "state"])]


class Submission(TenantEntity):
    review = models.ForeignKey(Review, on_delete=models.PROTECT, related_name="submissions")
    kind = models.CharField(max_length=10, choices=[("EMPLOYEE", "Employee"), ("MANAGER", "Manager")])
    round = models.PositiveIntegerField()
    content = models.JSONField(default=dict)
    evidence = models.ManyToManyField("evidence.EvidenceItem")
    submitted_at = models.DateTimeField(null=True)
    author = models.ForeignKey("companies.Membership", on_delete=models.PROTECT)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["review", "kind", "round"], name="submission_round_unique")
        ]


class FinalSnapshot(TenantEntity):
    review = models.OneToOneField(Review, on_delete=models.PROTECT, related_name="snapshot")
    content = models.JSONField()
    sha256 = models.CharField(max_length=64)


class ReviewEvent(TenantEntity):
    review = models.ForeignKey(Review, on_delete=models.PROTECT, related_name="events")
    actor = models.ForeignKey("companies.Membership", on_delete=models.PROTECT)
    action = models.CharField(max_length=60)
    reason = models.TextField(blank=True)
    version = models.PositiveIntegerField()
