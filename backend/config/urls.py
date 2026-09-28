from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.invitation import InvitationView
from apps.accounts.photo import ProfilePhotoView
from apps.accounts.views import (
    ContextView,
    LoginView,
    LogoutView,
    ProfileView,
    ResetRequestView,
    SessionView,
    SetPasswordView,
)
from apps.ai_coach.trainer import TrainerStatus, TrainerViewSet
from apps.companies.access import AccessRequestViewSet, MyRequestsView, RegisterView
from apps.companies.branding import BrandingView
from apps.companies.logo import CompanyLogoView
from apps.companies.platform import PlatformCompanyViewSet, PlatformOverview, PlatformReport, PricingPreview
from apps.companies.views import CompanyViewSet
from apps.development.views import CommitmentViewSet
from apps.evidence.views import EvidenceViewSet
from apps.notifications.views import NotificationViewSet
from apps.organisation.growth import GrowthViewSet
from apps.organisation.views import DepartmentViewSet, EmployeeViewSet, JobRoleViewSet
from apps.reports.views import OverviewView, ReviewExportView
from apps.reviews.views import CycleViewSet, ReviewViewSet
from apps.tasks.views import WorkViewSet

router = DefaultRouter()
router.register("access-requests", AccessRequestViewSet, basename="access-request")
router.register("platform/companies", PlatformCompanyViewSet, basename="platform-company")
router.register("growth", GrowthViewSet, basename="growth")
router.register("trainer/conversations", TrainerViewSet, basename="trainer-conversation")
router.register("review-cycles", CycleViewSet, basename="review-cycle")
router.register("reviews", ReviewViewSet, basename="review")
router.register("development", CommitmentViewSet, basename="development")
router.register("evidence", EvidenceViewSet, basename="evidence")
router.register("companies", CompanyViewSet, basename="company")
router.register("employees", EmployeeViewSet, basename="employee")
router.register("organisation/departments", DepartmentViewSet, basename="department")
router.register("organisation/roles", JobRoleViewSet, basename="role")
router.register("tasks", WorkViewSet, basename="task")
router.register("notifications", NotificationViewSet, basename="notification")
urlpatterns = [
    path("api/v1/auth/register/", RegisterView.as_view()),
    path("api/v1/auth/requests/", MyRequestsView.as_view()),
    path("api/v1/platform/overview/", PlatformOverview.as_view()),
    path("api/v1/platform/pricing/", PricingPreview.as_view()),
    path("api/v1/platform/reports/<uuid:pk>/", PlatformReport.as_view()),
    path("api/v1/company-logo/<uuid:pk>/", CompanyLogoView.as_view()),
    path("api/v1/auth/invitation/", InvitationView.as_view()),
    path("api/v1/trainer/status/", TrainerStatus.as_view()),
    path("api/v1/auth/profile/photo/", ProfilePhotoView.as_view()),
    path("api/v1/auth/branding/<slug:slug>/", BrandingView.as_view()),
    path("api/v1/reports/overview/", OverviewView.as_view()),
    path("api/v1/reports/reviews.csv", ReviewExportView.as_view()),
    path("api/v1/reports/reviews.csv/", ReviewExportView.as_view()),
    path("api/v1/health/", lambda request: JsonResponse({"status": "ok", "service": "bfl-api"})),
    path("api/v1/auth/session/", SessionView.as_view()),
    path("api/v1/auth/login/", LoginView.as_view()),
    path("api/v1/auth/logout/", LogoutView.as_view()),
    path("api/v1/auth/context/", ContextView.as_view()),
    path("api/v1/auth/profile/", ProfileView.as_view()),
    path("api/v1/auth/password-reset/", ResetRequestView.as_view()),
    path("api/v1/auth/set-password/", SetPasswordView.as_view()),
    path("api/v1/", include(router.urls)),
]
