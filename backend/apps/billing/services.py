from datetime import timedelta
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
    issued = day
    sequence, _ = InvoiceSequence.objects.get_or_create(billing_year=day.year)
    sequence = InvoiceSequence.objects.select_for_update().get(pk=sequence.pk)
    sequence.value += 1
    sequence.save(update_fields=["value"])
    snapshot = model_to_dict(
        config, exclude=["invoice_prefix", "issue_month", "issue_day", "tax_number", "tax_rate"]
    )
    # Version the frozen presentation so historical invoices retain their tax details.
    snapshot["billing_version"] = 2
    snapshot["annual_fee"] = str(config.annual_fee)
    snapshot["customer_name"] = company.name
    snapshot["customer_address"] = company.country  # No address field exists on Company.
    invoice = CompanyInvoice.objects.create(
        company=company,
        billing_year=day.year,
        invoice_number=f"BTFL-{day.year}-{sequence.value:06d}",
        amount=config.annual_fee,
        tax_amount=0,
        total_amount=config.annual_fee,
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
