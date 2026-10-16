"""Read-only, tenant-scoped formal review history. No coaching inputs or writes."""

from django.db.models import BooleanField, Case, F, Prefetch, Q, Value, When
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.development.models import Commitment
from apps.organisation.models import EmployeeProfile
from apps.organisation.serializers import EmployeeSerializer
from common.permissions import membership, require_manager

from .models import Review, Submission
from .schemas import PILLARS, TARGET_OUTCOMES


def people_scope(member):
    return (
        EmployeeProfile.objects.filter(company=member.company, membership__company=member.company)
        .select_related("membership__user", "department")
        .defer("avatar_data")
        .annotate(
            has_avatar=Case(
                When(avatar_data__isnull=False, then=Value(True)),
                default=Value(False),
                output_field=BooleanField(),
            )
        )
    )


def person_data(person):
    return {
        "id": str(person.id),
        "name": person.membership.user.get_full_name(),
        "designation": person.designation,
        "department": person.department.name if person.department else "",
        "photo_url": EmployeeSerializer().get_photo_url(person),
        "active": person.membership.active,
    }


class HistoryPeopleView(APIView):
    def get(self, request):
        member = membership(request)
        require_manager(member)
        qs = people_scope(member).exclude(membership=member).filter(membership__user__is_superuser=False)
        search = request.query_params.get("search", "").strip()[:150]
        if search:
            qs = qs.filter(
                Q(membership__user__first_name__icontains=search)
                | Q(membership__user__last_name__icontains=search)
                | Q(designation__icontains=search)
                | Q(department__name__icontains=search)
            )
        pager = PageNumberPagination()
        pager.page_size = 30
        rows = pager.paginate_queryset(qs.order_by("membership__user__first_name", "id"), request)
        return pager.get_paginated_response([person_data(p) for p in rows])


def text(value):
    return value if isinstance(value, str) else ""


def mapping(value):
    return value if isinstance(value, dict) else {}


def progression(before, after, ordered=False):
    if not before or not after:
        return "Not comparable"
    if ordered and before in TARGET_OUTCOMES and after in TARGET_OUTCOMES:
        delta = TARGET_OUTCOMES.index(after) - TARGET_OUTCOMES.index(before)
        return "Improved" if delta > 0 else "Declined" if delta < 0 else "Sustained"
    if before == after:
        return "Sustained"
    return f"Changed from {before} to {after}"


def record_data(review):
    result = {
        "id": str(review.id),
        "kind": review.cycle.kind,
        "year": review.cycle.year,
        "state": review.state,
        "finalised_at": review.finalised_at,
        "overall": "",
        "summary": "",
        "pillars": [],
        "source": "Incomplete review",
    }
    if review.state != "FINALISED":
        return result
    snapshot = getattr(review, "snapshot", None)
    source = mapping(snapshot.content) if snapshot else None
    result["source"] = (
        "Sealed final record" if source is not None else "Finalised review fields (snapshot unavailable)"
    )
    assessment = mapping(source.get("hr_assessment")) if source is not None else mapping(review.hr_assessment)
    result.update(overall=text(assessment.get("overall")), summary=text(assessment.get("rationale")))
    forms = (
        source.get("forms", [])
        if source is not None
        else [
            {"kind": f.kind, "content": f.content, "submitted_at": f.submitted_at}
            for f in review.history_forms
        ]
    )
    forms = forms if isinstance(forms, list) else []
    submitted = {
        f.get("kind"): mapping(f.get("content"))
        for f in forms
        if isinstance(f, dict) and f.get("submitted_at")
    }
    manager = submitted.get("MANAGER", {})
    employee = submitted.get("EMPLOYEE", {})
    # hr_assessment is the final authority; an appraisal summary is a human fallback.
    if not result["summary"]:
        result["summary"] = text(manager.get("summary"))
    targets = source.get("pillar_context", []) if source is not None else review.pillar_context
    targets = (
        {text(t.get("pillar")).lower(): t for t in targets if isinstance(t, dict)}
        if isinstance(targets, list)
        else {}
    )
    for pillar in PILLARS:
        target = targets.get(pillar, {})
        appraisal = mapping(mapping(manager.get("pillars")).get(pillar))
        result["pillars"].append(
            {
                "pillar": pillar,
                "target": text(target.get("target")),
                "success_measure": text(target.get("success_measure")),
                "notes": text(target.get("notes")),
                "reflection": text(mapping(employee.get("pillars")).get(pillar)),
                "appraisal": text(appraisal.get("narrative")),
                "outcome": text(appraisal.get("outcome")),
                "judgement": text(appraisal.get("descriptor")),
            }
        )
    return result


def commitment_data(member, mid, end):
    if not mid or mid.state != "FINALISED":
        return []
    live = list(Commitment.objects.filter(company=member.company, review=mid, employee_id=mid.employee_id))
    by_id = {str(c.id): c for c in live}
    snapshot = getattr(mid, "snapshot", None)
    baseline = (
        mapping(snapshot.content).get("commitments", [])
        if snapshot
        else [
            {
                "id": str(c.id),
                "action": c.action,
                "owner_id": str(c.owner_id),
                "due_date": c.due_date,
                "success_measure": c.success_measure,
                "manager_support": c.manager_support,
            }
            for c in live
        ]
    )
    baseline = baseline if isinstance(baseline, list) else []
    # Only an explicit prior_midyear relationship permits attaching recorded outcomes.
    outcomes = {}
    if end and end.state == "FINALISED" and end.prior_midyear_id == mid.id:
        end_snapshot = getattr(end, "snapshot", None)
        outcomes = (
            mapping(mapping(end_snapshot.content).get("midyear_comparison"))
            if end_snapshot
            else mapping(end.comparison)
        )
    owner_ids = [c.get("owner_id") for c in baseline if isinstance(c, dict) and c.get("owner_id")]
    # Snapshot owner IDs originated in the database; constrain name resolution to this tenant.
    owners = {
        str(p.id): p.membership.user.get_full_name() for p in people_scope(member).filter(id__in=owner_ids)
    }
    result = []
    for c in baseline:
        if not isinstance(c, dict):
            continue
        key = str(c.get("id", ""))
        current = by_id.get(key)
        outcome = mapping(outcomes.get(key))
        result.append(
            {
                "id": key,
                "action": text(c.get("action")),
                "owner": owners.get(str(c.get("owner_id")), "Not recorded"),
                "due_date": c.get("due_date"),
                "success_measure": text(c.get("success_measure")),
                "support": text(c.get("manager_support")),
                "current_status": current.get_status_display() if current else None,
                "year_end_outcome": text(outcome.get("outcome")),
                "year_end_rationale": text(outcome.get("rationale")),
            }
        )
    return result


class ReviewHistoryView(APIView):
    def get(self, request):
        member = membership(request)
        employee_id = request.query_params.get("employee_id")
        people = people_scope(member)
        if employee_id:
            employee_id = serializers.UUIDField().run_validation(employee_id)
            if not member.is_head_hr and not people.filter(id=employee_id, membership=member).exists():
                raise PermissionDenied("You may only view your own review history.")
            person = get_object_or_404(people, id=employee_id)
        else:
            person = get_object_or_404(people, membership=member)
        reviews = Review.objects.filter(
            company=member.company, employee=person, cycle__company=member.company
        )
        years = list(reviews.order_by("-cycle__year").values_list("cycle__year", flat=True).distinct())
        year = request.query_params.get("year")
        year = (
            serializers.IntegerField(min_value=1, max_value=9999).run_validation(year)
            if year
            else (years[0] if years else None)
        )
        selected = (
            list(
                reviews.filter(cycle__year=year)
                .select_related("cycle", "snapshot")
                .prefetch_related(
                    Prefetch(
                        "submissions",
                        queryset=Submission.objects.filter(
                            company=member.company, submitted_at__isnull=False, round=F("review__round")
                        ),
                        to_attr="history_forms",
                    )
                )
            )
            if year
            else []
        )
        mid = next((r for r in selected if r.cycle.kind == "MID_YEAR"), None)
        end = next((r for r in selected if r.cycle.kind == "YEAR_END"), None)
        mid_data, end_data = record_data(mid) if mid else None, record_data(end) if end else None
        paired = bool(mid and end and mid.state == end.state == "FINALISED")
        pillars = []
        for index, pillar in enumerate(PILLARS):
            before = mid_data["pillars"][index] if mid_data and mid_data["pillars"] else None
            after = end_data["pillars"][index] if end_data and end_data["pillars"] else None
            pillars.append(
                {
                    "pillar": pillar,
                    "mid_year": before,
                    "year_end": after,
                    "progress": progression(before["outcome"], after["outcome"], ordered=True)
                    if paired and before and after
                    else "Not comparable",
                    "judgement_change": progression(before["judgement"], after["judgement"])
                    if paired and before and after
                    else "Not comparable",
                }
            )
        history = []
        for row in reviews.order_by("-cycle__year", "-cycle__kind").values(
            "id",
            "cycle__year",
            "cycle__kind",
            "state",
            "finalised_at",
            "hr_assessment",
            "snapshot__id",
            "snapshot__content__hr_assessment",
        ):
            assessment = (
                row["snapshot__content__hr_assessment"] if row["snapshot__id"] else row["hr_assessment"]
            )
            history.append(
                {
                    "id": str(row["id"]),
                    "year": row["cycle__year"],
                    "kind": row["cycle__kind"],
                    "state": row["state"],
                    "finalised_at": row["finalised_at"],
                    "overall": text(mapping(assessment).get("overall"))
                    if row["state"] == "FINALISED"
                    else "",
                }
            )
        response = Response(
            {
                "person": person_data(person),
                "available_years": years,
                "selected_year": year,
                "mid_year": mid_data,
                "year_end": end_data,
                "overall_progress": progression(mid_data["overall"], end_data["overall"])
                if paired
                else "Not comparable",
                "pillar_comparison": pillars,
                "commitments": commitment_data(member, mid, end),
                "history": history,
            }
        )
        response["Cache-Control"] = "no-store, private"
        return response
