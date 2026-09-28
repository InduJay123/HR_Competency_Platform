import csv

from django.db.models import Count, F
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.organisation.models import EmployeeProfile
from apps.reviews.services import visible_reviews
from apps.tasks.services import visible_work
from common.permissions import membership, require_hr


def safe_cell(value):
    value = str(value or "")
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else value


class OverviewView(APIView):
    def get(self, request):
        member = membership(request)
        scope = request.query_params.get("scope", "employee")
        tasks = visible_work(member)
        reviews = visible_reviews(member)
        if scope == "hr":
            require_hr(member)
        elif scope == "manager":
            if not member.is_manager:
                raise PermissionDenied("Manager responsibility required.")
            tasks = tasks.filter(assigned_to__reporting__manager__membership=member)
            reviews = reviews.filter(manager__membership=member)
        elif scope == "employee":
            tasks = tasks.filter(assigned_to__membership=member)
            reviews = reviews.filter(employee__membership=member)
        else:
            raise PermissionDenied("Unknown responsibility.")
        today = timezone.localdate()
        active = tasks.exclude(status__in=["DONE", "CANCELLED"])
        due = tasks.exclude(status="CANCELLED").filter(due_date__lt=today)
        on_time = due.filter(status="DONE", completed_at__date__lte=F("due_date")).count()
        months = list(
            tasks.filter(completed_at__isnull=False)
            .annotate(month=TruncMonth("completed_at"))
            .values("month")
            .annotate(total=Count("id"))
            .order_by("-month")[:6]
        )
        departments = []
        if scope == "hr":
            departments = list(
                reviews.values("employee__department__name", "state")
                .annotate(total=Count("id"))
                .order_by("employee__department__name", "state")
            )
        return Response(
            {
                "scope": scope,
                "as_of": today,
                "work": {
                    "total": tasks.count(),
                    "active": active.count(),
                    "blocked": active.filter(status="BLOCKED").count(),
                    "overdue": active.filter(due_date__lt=today).count(),
                    "completed": tasks.filter(status="DONE").count(),
                    "due_items": due.count(),
                    "on_time": on_time,
                },
                "work_status": list(tasks.values("status").annotate(total=Count("id")).order_by("status")),
                "completed_by_month": list(reversed(months)),
                "reviews": {
                    "total": reviews.count(),
                    "finalised": reviews.filter(state="FINALISED").count(),
                    "overdue": reviews.filter(cycle__due_on__lt=today).exclude(state="FINALISED").count(),
                },
                "review_states": list(reviews.values("state").annotate(total=Count("id")).order_by("state")),
                "departments": departments,
                "people": EmployeeProfile.objects.filter(
                    company=member.company, membership__active=True
                ).count()
                if scope == "hr"
                else None,
                "next_reviews": list(
                    reviews.exclude(state="FINALISED")
                    .order_by("cycle__due_on")
                    .values("id", "cycle__kind", "cycle__year", "cycle__due_on", "state")[:5]
                ),
                "attention": list(
                    active.filter(status="BLOCKED")
                    .order_by("due_date")
                    .values("id", "title", "due_date", "status")[:5]
                ),
            }
        )


class ReviewExportView(APIView):
    def get(self, request):
        member = membership(request)
        require_hr(member)
        qs = visible_reviews(member)
        if request.query_params.get("cycle"):
            qs = qs.filter(cycle_id=request.query_params["cycle"])
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="review-progress.csv"'
        response["Cache-Control"] = "no-store, private"
        writer = csv.writer(response)
        writer.writerow(
            [
                "Employee",
                "Manager",
                "Year",
                "Cycle",
                "Status",
                "Due",
                "Employee acknowledged",
                "Manager acknowledged",
                "Finalised",
            ]
        )
        for r in qs.iterator(chunk_size=200):
            writer.writerow(
                [
                    safe_cell(x)
                    for x in [
                        r.employee.membership.user.get_full_name(),
                        r.manager.membership.user.get_full_name(),
                        r.cycle.year,
                        r.cycle.kind,
                        r.state,
                        r.cycle.due_on,
                        r.employee_ack,
                        r.manager_ack,
                        r.finalised_at,
                    ]
                ]
            )
        record(member, "report.exported", member, report="review-progress")
        return response
