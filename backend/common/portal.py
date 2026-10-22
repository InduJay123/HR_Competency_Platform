from urllib.parse import urlsplit

from django.conf import settings
from django.http import JsonResponse


def portal_host(request):
    host = request.get_host().split(":")[0].lower()
    # Next's local rewrite changes Host. Enabled only for the local portal setup.
    if settings.LOCAL_ADMIN_LOGIN_ENABLED and host in {"localhost", "127.0.0.1", "backend"}:
        forwarded = request.headers.get("X-Forwarded-Host", "").split(":")[0].lower()
        if forwarded in {"localhost", "127.0.0.1", "admin.localhost"}:
            host = forwarded
    return host


def is_admin_host(request):
    return (portal_host(request) == urlsplit(settings.ADMIN_FRONTEND_URL).hostname
            and not local_admin_available(request))


def local_admin_available(request):
    return (settings.LOCAL_ADMIN_LOGIN_ENABLED
            and portal_host(request) in {"localhost", "127.0.0.1"})


def is_admin_portal(request):
    return is_admin_host(request) or (
        local_admin_available(request) and request.session.get("portal_mode") == "admin"
    )


class PortalMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/v1/"):
            admin = is_admin_portal(request)
            user = request.user
            denied = False
            if user.is_authenticated:
                bound = request.session.get("portal_host")
                denied = bool(bound and bound != portal_host(request))
                denied |= bool(user.is_superuser != admin)
                denied |= bool(admin and bound != portal_host(request))
            if request.path.startswith("/api/v1/platform/") and not admin:
                denied = True
            if denied:
                if request.path == "/api/v1/auth/session/":
                    from django.middleware.csrf import get_token
                    return JsonResponse({"authenticated": False, "csrf_token": get_token(request)})
                # Logout remains available to clear an old or incompatible session.
                if request.path not in {"/api/v1/auth/logout/", "/api/v1/auth/login/", "/api/v1/auth/admin-login/"}:
                    return JsonResponse({"error": {"code": "PORTAL_ACCESS_DENIED", "details": "Please sign in from the appropriate portal."}}, status=403)
        return self.get_response(request)
