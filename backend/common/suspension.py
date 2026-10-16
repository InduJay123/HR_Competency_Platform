"""Explicit restricted access; an inactive company never becomes an active tenant."""
from django.db.models import Q
from apps.companies.models import Company, Membership, PlatformEvent

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


def suspension_details(company):
    # Only the latest access decision belongs to the current suspension.
    event = PlatformEvent.objects.filter(company=company, action="company.access_changed").order_by("-created_at", "-id").first() if not company.active else None
    current = event if event and event.details.get("active") is False else None
    return {
        "suspension_note": current.details.get("note", "") if current else "",
        "suspended_at": current.created_at if current else None,
        "suspended_by": str(current.actor_id) if current else None,
    }


def restricted_state(member):
    restricted = bool(member and not member.company.active)
    billing_access = bool(member and member.is_head_hr and (member.company.active or billing_suspended(member)))
    return {
        **(suspension_details(member.company) if restricted else {}),
        "allowed_areas": (["billing", "account"] if billing_access else ["account"]) if restricted else [],
        "suspension_label": member.company.get_suspension_reason_display() if restricted else "",
        "restricted_access": restricted,
        "suspension_reason": member.company.suspension_reason if restricted else None,
        "suspension_message": suspension_message(member) if restricted else "",
        "billing_access": billing_access,
    }
