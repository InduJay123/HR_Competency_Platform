"""Explicit restricted access; an inactive company never becomes an active tenant."""
from django.db.models import Q
from apps.companies.models import Company, Membership

BILLING_MESSAGE = "Company access temporarily suspended due to outstanding billing."
ADMIN_MESSAGE = "Company access is temporarily suspended. Contact the Platform Administrator."


def eligible_memberships(user):
    return Membership.objects.select_related("company").filter(user=user, active=True).filter(
        Q(company__active=True) | Q(is_head_hr=True)
    )


def billing_suspended(member):
    return not member.company.active and member.company.suspension_reason == Company.SuspensionReason.BILLING_OVERDUE


def suspension_message(member):
    return BILLING_MESSAGE if billing_suspended(member) else ADMIN_MESSAGE


def restricted_state(member):
    restricted = bool(member and not member.company.active)
    return {
        "restricted_access": restricted,
        "suspension_reason": member.company.suspension_reason if restricted else None,
        "suspension_message": suspension_message(member) if restricted else "",
        "billing_access": bool(member and member.is_head_hr and (member.company.active or billing_suspended(member))),
    }
