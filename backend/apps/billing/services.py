import calendar
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from django.db import transaction
from django.forms.models import model_to_dict
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.companies.models import Company

from .models import BillingSettings, CompanyInvoice, InvoiceSequence


def today():
    return timezone.localtime(timezone.now(), ZoneInfo("Asia/Colombo")).date()


def audit(invoice, action, actor=None, **metadata):
    AuditLog.objects.create(
        company_id=invoice.company_id,
        actor=actor,
        action=action,
        object_id=str(invoice.pk),
        metadata=metadata,
    )


@transaction.atomic
def ensure_invoice(company_id, day=None):
    day = day or today()
    # Serialize creation per company; DB constraint also protects other writers.
    company = Company.objects.select_for_update().get(pk=company_id)
    existing = CompanyInvoice.objects.filter(company=company, billing_year=day.year).first()
    if existing:
        return existing
    config = BillingSettings.objects.filter(pk=1, active=True).first()
    if not config or not company.active:
        return None
    issued = date(
        day.year,
        config.issue_month,
        min(config.issue_day, calendar.monthrange(day.year, config.issue_month)[1]),
    )
    if day < issued:
        return None
    sequence, _ = InvoiceSequence.objects.get_or_create(billing_year=day.year)
    sequence = InvoiceSequence.objects.select_for_update().get(pk=sequence.pk)
    sequence.value += 1
    sequence.save(update_fields=["value"])
    snapshot = model_to_dict(config)
    snapshot["annual_fee"] = str(config.annual_fee)
    snapshot["tax_rate"] = str(config.tax_rate)
    snapshot["customer_name"] = company.name
    snapshot["customer_address"] = company.country  # No address field exists on Company.
    tax = (config.annual_fee * config.tax_rate / Decimal(100)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    invoice = CompanyInvoice.objects.create(
        company=company,
        billing_year=day.year,
        invoice_number=f"{config.invoice_prefix}-{day.year}-{sequence.value:06d}",
        amount=config.annual_fee,
        tax_amount=tax,
        total_amount=config.annual_fee + tax,
        currency=config.currency,
        issued_at=issued,
        due_at=issued + timedelta(days=config.due_days),
        snapshot=snapshot,
    )
    audit(invoice, "billing.invoice_issued")
    return invoice


def ensure_current_invoices():
    for company_id in Company.objects.filter(active=True).values_list("id", flat=True).iterator():
        ensure_invoice(company_id)


def overdue(invoice):
    return invoice.status != CompanyInvoice.Status.PAID and invoice.due_at < today()
