from celery import shared_task

from .services import ensure_current_invoices


@shared_task
def issue_annual_invoices():
    ensure_current_invoices()
