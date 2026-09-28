from django.conf import settings
from django.db import models

from common.models import Entity, TenantEntity


class Company(Entity):
    name = models.CharField(max_length=180)
    slug = models.SlugField(unique=True)
    tagline = models.CharField(max_length=240, blank=True)
    logo_url = models.URLField(blank=True)
    active = models.BooleanField(default=True)
    stewardship_code = models.CharField(max_length=24, unique=True, null=True, editable=False)
    employee_sequence = models.PositiveIntegerField(default=0, editable=False)
    nature = models.CharField(max_length=180, blank=True)
    country = models.CharField(max_length=100, blank=True)
    market = models.CharField(max_length=12, default="SL")
    declared_employees = models.PositiveIntegerField(null=True, default=None)
    mission = models.TextField(blank=True, max_length=2000)
    vision = models.TextField(blank=True, max_length=2000)
    website = models.URLField(blank=True)
    approved_at = models.DateTimeField(null=True)
    logo_data = models.BinaryField(null=True, editable=False)

    def save(self, *args, **kwargs):
        from django.db import transaction

        with transaction.atomic():
            if not self.stewardship_code:
                counter, _ = CodeSequence.objects.get_or_create(pk=1)
                counter = CodeSequence.objects.select_for_update().get(pk=counter.pk)
                counter.value += 1
                counter.save(update_fields=["value"])
                self.stewardship_code = f"ST{counter.value:04d}"
            super().save(*args, **kwargs)


class Membership(TenantEntity):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    active = models.BooleanField(default=True)
    is_hr = models.BooleanField(default=False)
    is_head_hr = models.BooleanField(default=False)
    is_manager = models.BooleanField(default=False)
    stewardship_code = models.CharField(max_length=40, unique=True, null=True, editable=False)
    approved_at = models.DateTimeField(null=True)

    def save(self, *args, **kwargs):
        from django.db import transaction

        with transaction.atomic():
            if not self.stewardship_code:
                company = Company.objects.select_for_update().get(pk=self.company_id)
                company.employee_sequence += 1
                company.save(update_fields=["employee_sequence"])
                self.stewardship_code = f"{company.stewardship_code}-{company.employee_sequence}"
            super().save(*args, **kwargs)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "user"], name="membership_unique"),
            models.CheckConstraint(
                condition=models.Q(is_head_hr=False) | models.Q(is_hr=True), name="head_hr_is_hr"
            ),
        ]

    @property
    def contexts(self):
        result = ["employee", "reviews"]
        if self.is_manager:
            result.append("manager")
        if self.is_hr:
            result.append("hr")
        if self.is_head_hr:
            result.append("approvals")
        return result


class CodeSequence(models.Model):
    value = models.PositiveIntegerField(default=0)


class AccessRequest(Entity):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    company = models.ForeignKey(Company, on_delete=models.PROTECT, null=True)
    kind = models.CharField(max_length=10, choices=[("COMPANY", "Company"), ("EMPLOYEE", "Employee")])
    status = models.CharField(max_length=12, default="PENDING")
    details = models.JSONField(default=dict)
    decision_note = models.TextField(blank=True)
    decided_at = models.DateTimeField(null=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="access_decisions"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "company"],
                condition=models.Q(status="PENDING", kind="EMPLOYEE"),
                name="one_pending_join_request",
            )
        ]


class PlatformEvent(Entity):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    company = models.ForeignKey(Company, on_delete=models.PROTECT, null=True)
    action = models.CharField(max_length=80)
    details = models.JSONField(default=dict)


class CompanyQuote(TenantEntity):
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    calculation = models.JSONField()
    note = models.TextField(blank=True, max_length=2000)
