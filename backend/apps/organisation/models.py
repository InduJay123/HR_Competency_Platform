from django.db import models

from common.models import TenantEntity


class Department(TenantEntity):
    name = models.CharField(max_length=120)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["company", "name"], name="department_name_unique")]


class JobRole(TenantEntity):
    name = models.CharField(max_length=120)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["company", "name"], name="jobrole_name_unique")]


class EmployeeProfile(TenantEntity):
    membership = models.OneToOneField(
        "companies.Membership", on_delete=models.PROTECT, related_name="profile"
    )
    department = models.ForeignKey(Department, on_delete=models.PROTECT, null=True)
    job_role = models.ForeignKey(JobRole, on_delete=models.PROTECT, null=True)
    designation = models.CharField(max_length=160, blank=True)
    joined_on = models.DateField(null=True)
    photo_url = models.URLField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    contact_email = models.EmailField(blank=True)
    employment_company = models.CharField(max_length=180, blank=True)
    location = models.CharField(max_length=120, blank=True)
    bio = models.TextField(blank=True, max_length=2000)
    skills = models.CharField(max_length=500, blank=True)
    avatar_data = models.BinaryField(null=True, editable=False)
    notification_digest = models.BooleanField(default=True)
    senior_leader = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=1)
    onboarding_completed_at = models.DateTimeField(null=True)


class ReportingRelationship(TenantEntity):
    employee = models.OneToOneField(EmployeeProfile, on_delete=models.PROTECT, related_name="reporting")
    manager = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="direct_reports")

    class Meta:
        constraints = [
            models.CheckConstraint(condition=~models.Q(employee=models.F("manager")), name="no_self_manager")
        ]


class GrowthEntry(TenantEntity):
    owner = models.ForeignKey("companies.Membership", on_delete=models.PROTECT)
    subject = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name="growth_entries")
    kind = models.CharField(
        max_length=16,
        choices=[("CONTRIBUTION", "Contribution"), ("CAPABILITY", "Capability"), ("LEGACY", "Legacy")],
    )
    category = models.CharField(max_length=80)
    title = models.CharField(max_length=180)
    details = models.TextField(max_length=6000)
    outcome = models.TextField(max_length=3000, blank=True)
    support = models.TextField(max_length=3000, blank=True)
    evidence_url = models.URLField(blank=True)
    shared = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=1)
