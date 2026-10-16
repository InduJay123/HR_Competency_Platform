from django.conf import settings
from django.db import models

from common.models import Entity, TenantEntity


class BillingSettings(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    annual_fee = models.DecimalField(max_digits=14, decimal_places=2, null=True)
    currency = models.CharField(max_length=3, blank=True)
    invoice_prefix = models.CharField(max_length=16, blank=True)
    issuer_name = models.CharField(max_length=180, blank=True)
    issuer_address = models.TextField(blank=True)
    issuer_registration_number = models.CharField(max_length=100, blank=True)
    tax_number = models.CharField(max_length=100, blank=True)
    issuer_email = models.EmailField(blank=True)
    issuer_phone = models.CharField(max_length=60, blank=True)
    bank_name = models.CharField(max_length=180, blank=True)
    bank_account_name = models.CharField(max_length=180, blank=True)
    bank_account_number = models.CharField(max_length=100, blank=True)
    bank_branch = models.CharField(max_length=180, blank=True)
    swift_code = models.CharField(max_length=40, blank=True)
    payment_instructions = models.TextField(blank=True)
    issue_month = models.PositiveSmallIntegerField(default=1)
    issue_day = models.PositiveSmallIntegerField(default=1)
    due_days = models.PositiveSmallIntegerField(default=30)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    active = models.BooleanField(default=False)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(id=1), name="billing_settings_singleton")]


class InvoiceSequence(models.Model):
    billing_year = models.PositiveIntegerField(primary_key=True)
    value = models.PositiveIntegerField(default=0)


class CompanyInvoice(TenantEntity):
    class Status(models.TextChoices):
        AWAITING_PAYMENT = "AWAITING_PAYMENT", "Awaiting payment"
        PAYMENT_PROOF_SUBMITTED = "PAYMENT_PROOF_SUBMITTED", "Payment proof submitted"
        PAID = "PAID", "Paid"

    billing_year = models.PositiveIntegerField()
    invoice_number = models.CharField(max_length=40, unique=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3)
    issued_at = models.DateField()
    due_at = models.DateField()
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.AWAITING_PAYMENT)
    snapshot = models.JSONField(default=dict)
    invoice_storage_path = models.CharField(max_length=255, blank=True)
    paid_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "billing_year"], name="billing_company_year_unique")
        ]
        ordering = ["-billing_year", "invoice_number"]


class PaymentProof(Entity):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Awaiting verification"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    # Company is derived through invoice, eliminating conflicting company IDs.
    invoice = models.ForeignKey(CompanyInvoice, on_delete=models.PROTECT, related_name="proofs")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="billing_uploads"
    )
    storage_path = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=180)
    content_type = models.CharField(max_length=40)
    file_size = models.PositiveIntegerField()
    transaction_reference = models.CharField(max_length=180)
    payment_date = models.DateField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.TextField(blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="billing_verifications"
    )
    verified_at = models.DateTimeField(null=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["invoice"], condition=models.Q(status="PENDING"), name="billing_one_pending_proof"
            )
        ]
