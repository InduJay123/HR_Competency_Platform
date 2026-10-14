from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from apps.companies.models import Membership


def membership(request):
    if not request.user.is_authenticated:
        raise NotAuthenticated()
    company_id = request.session.get("company_id")
    member = (
        Membership.objects.select_related("company", "user")
        .filter(company_id=company_id, user=request.user, active=True, company__active=True)
        .first()
    )
    if member is None:
        raise PermissionDenied("Select an active organisation membership.")
    return member


def require_hr(member):
    if not member.is_hr:
        raise PermissionDenied("HR access is required.")


def require_manager(member):
    if not member.active or not member.is_head_hr:
        raise PermissionDenied("Active Chief Steward access is required.")
