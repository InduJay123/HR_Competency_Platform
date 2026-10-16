import re
from django.http import JsonResponse
from apps.companies.models import Membership
from .suspension import billing_suspended, suspension_message


class SuspendedCompanyMiddleware:
    """Deny operational APIs even if a view does not use membership()."""
    AUTH_PATHS = {
        "/api/v1/auth/session/", "/api/v1/auth/login/", "/api/v1/auth/logout/",
        "/api/v1/auth/context/", "/api/v1/auth/password-reset/", "/api/v1/auth/set-password/",
    }
    ACCOUNT_PATHS = {"/api/v1/auth/profile/", "/api/v1/auth/profile/photo/"}
    BILLING_PATHS = {"/api/v1/billing/current/", "/api/v1/billing/history/", "/api/v1/billing/current/payment-proof/"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Authentication must succeed before any company status is disclosed.
        if not request.path.startswith("/api/v1/") or not request.user.is_authenticated or request.user.is_superuser:
            return self.get_response(request)
        if request.path in self.AUTH_PATHS:
            return self.get_response(request)
        member = Membership.objects.select_related("company").filter(
            user=request.user, company_id=request.session.get("company_id"), active=True, company__active=False
        ).first()
        if not member:
            return self.get_response(request)
        if member.is_head_hr:
            if request.path in self.ACCOUNT_PATHS:
                return self.get_response(request)
            billing_file = re.fullmatch(r"/api/v1/billing/(?:invoices/[0-9a-fA-F-]{36}/pdf|payment-proofs/[0-9a-fA-F-]{36}/file)/", request.path)
            if billing_suspended(member) and (request.path in self.BILLING_PATHS or billing_file):
                return self.get_response(request)
        response = JsonResponse({"error": {"status": 403, "code": "COMPANY_SUSPENDED", "details": {"detail": suspension_message(member)}}}, status=403)
        response["Cache-Control"] = "private, no-store"
        return response
