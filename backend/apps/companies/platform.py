from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organisation.models import EmployeeProfile
from apps.reviews.models import FinalSnapshot, Review

from .models import AccessRequest, Company, CompanyQuote, Membership, PlatformEvent
from .pricing import PricingInput, calculate


class IsPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


def company_data(company):
    return {
        "id": company.id,
        "name": company.name,
        "stewardship_code": company.stewardship_code,
        "nature": company.nature,
        "country": company.country,
        "market": company.market,
        "declared_employees": company.declared_employees,
        "active": company.active,
        "created_at": company.created_at,
        "approved_at": company.approved_at,
        "people": Membership.objects.filter(company=company, active=True, user__is_superuser=False).count(),
        "tagline": company.tagline,
        "vision": company.vision,
        "mission": company.mission,
    }


class PlatformOverview(APIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        return Response(
            {
                "companies": Company.objects.count(),
                "active_companies": Company.objects.filter(active=True).count(),
                "pending_companies": AccessRequest.objects.filter(kind="COMPANY", status="PENDING").count(),
                "employees": Membership.objects.filter(active=True, user__is_superuser=False).count(),
                "finalised_reviews": Review.objects.filter(state="FINALISED").count(),
                "markets": list(
                    Company.objects.values("market").annotate(total=Count("id")).order_by("market")
                ),
                "recent_events": list(
                    PlatformEvent.objects.order_by("-created_at").values(
                        "action", "company__name", "created_at", "details"
                    )[:20]
                ),
            }
        )


class PlatformCompanyViewSet(viewsets.ViewSet):
    permission_classes = [IsPlatformAdmin]

    def list(self, request):
        # Explicit platform-only surface: never broaden normal tenant endpoints.
        qs = Company.objects.order_by("-created_at")
        term = request.query_params.get("search", "")[:150]
        if term:
            from django.db.models import Q

            qs = qs.filter(Q(name__icontains=term) | Q(stewardship_code__icontains=term))
        from rest_framework.pagination import PageNumberPagination

        pager = PageNumberPagination()
        page = pager.paginate_queryset(qs, request)
        return pager.get_paginated_response([company_data(c) for c in page])

    def retrieve(self, request, pk=None):
        company = get_object_or_404(Company, pk=pk)
        result = company_data(company)
        result["quotes"] = list(
            CompanyQuote.objects.filter(company=company)
            .order_by("-created_at")
            .values("id", "calculation", "note", "created_at")[:20]
        )
        result["review_states"] = list(
            Review.objects.filter(company=company).values("state").annotate(total=Count("id"))
        )
        return Response(result)

    @action(detail=True, methods=["post"])
    def access(self, request, pk=None):
        company = get_object_or_404(Company, pk=pk)

        class Change(serializers.Serializer):
            active = serializers.BooleanField()
            note = serializers.CharField(max_length=2000)

        data = Change(data=request.data)
        data.is_valid(raise_exception=True)
        company.active = data.validated_data["active"]
        company.save(update_fields=["active", "updated_at"])
        PlatformEvent.objects.create(
            actor=request.user, company=company, action="company.access_changed", details=data.validated_data
        )
        return Response(company_data(company))

    @action(detail=True, methods=["get"])
    def people(self, request, pk=None):
        get_object_or_404(Company, pk=pk)
        qs = (
            EmployeeProfile.objects.filter(company_id=pk, membership__user__is_superuser=False)
            .select_related("membership__user")
            .defer("avatar_data")
            .order_by("created_at")
        )
        from rest_framework.pagination import PageNumberPagination

        pager = PageNumberPagination()
        page = pager.paginate_queryset(qs, request)
        PlatformEvent.objects.create(actor=request.user, company_id=pk, action="platform.people_viewed")
        return pager.get_paginated_response(
            [
                {
                    "id": p.id,
                    "name": p.membership.user.get_full_name(),
                    "email": p.membership.user.email,
                    "code": p.membership.stewardship_code,
                    "designation": p.designation,
                    "employment_joined_on": p.joined_on,
                    "platform_joined_at": p.membership.approved_at or p.membership.created_at,
                    "active": p.membership.active,
                    "role": "Head of HR"
                    if p.membership.is_head_hr
                    else "HR"
                    if p.membership.is_hr
                    else "Manager"
                    if p.membership.is_manager
                    else "Employee",
                }
                for p in page
            ]
        )

    @action(detail=True, methods=["get"])
    def reports(self, request, pk=None):
        get_object_or_404(Company, pk=pk)
        qs = (
            FinalSnapshot.objects.filter(company_id=pk)
            .select_related("review__employee__membership__user", "review__cycle")
            .defer("content")
            .order_by("-created_at")
        )
        from rest_framework.pagination import PageNumberPagination

        pager = PageNumberPagination()
        page = pager.paginate_queryset(qs, request)
        PlatformEvent.objects.create(actor=request.user, company_id=pk, action="platform.report_index_viewed")
        return pager.get_paginated_response(
            [
                {
                    "id": s.id,
                    "employee": s.review.employee.membership.user.get_full_name(),
                    "year": s.review.cycle.year,
                    "kind": s.review.cycle.kind,
                    "finalised_at": s.review.finalised_at,
                    "sha256": s.sha256,
                }
                for s in page
            ]
        )

    @action(detail=True, methods=["post"])
    def quote(self, request, pk=None):
        company = get_object_or_404(Company, pk=pk)
        data = PricingInput(data=request.data)
        data.is_valid(raise_exception=True)
        current_people = Membership.objects.filter(
            company=company, active=True, user__is_superuser=False
        ).count()
        if data.validated_data["employees"] < current_people:
            raise ValidationError("Licensed headcount cannot be below active company memberships.")
        result = calculate(data.validated_data)
        quote = CompanyQuote.objects.create(
            company=company,
            created_by=request.user,
            calculation=result,
            note=data.validated_data.get("note", ""),
        )
        PlatformEvent.objects.create(
            actor=request.user,
            company=company,
            action="company.quote_saved",
            details={"quote": str(quote.id)},
        )
        return Response({"id": quote.id, "calculation": result, "created_at": quote.created_at}, status=201)


class PlatformReport(APIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request, pk):
        snapshot = get_object_or_404(FinalSnapshot, pk=pk)
        PlatformEvent.objects.create(
            actor=request.user,
            company=snapshot.company,
            action="platform.final_report_read",
            details={"snapshot": str(snapshot.id)},
        )
        return Response(
            {"content": snapshot.content, "sha256": snapshot.sha256, "created_at": snapshot.created_at}
        )


class PricingPreview(APIView):
    permission_classes = [IsPlatformAdmin]

    def post(self, request):
        data = PricingInput(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(calculate(data.validated_data))
