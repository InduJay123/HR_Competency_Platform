from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.ai_coach.views import CoachingActions
from apps.audit.services import record
from apps.companies.models import Membership
from apps.organisation.models import EmployeeProfile
from common.permissions import membership, require_hr

from . import services
from .comparison import ComparisonActions
from .models import ReviewCycle
from .serializers import (
    AcknowledgementSerializer,
    ConversationSerializer,
    CycleSerializer,
    LaunchSerializer,
    ReviewSerializer,
    RevisionSerializer,
    SaveFormSerializer,
    VersionSerializer,
)


def validated(cls, request):
    data = cls(data=request.data)
    data.is_valid(raise_exception=True)
    return data.validated_data


class CycleViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CycleSerializer

    def get_queryset(self):
        member = membership(self.request)
        require_hr(member)
        return ReviewCycle.objects.filter(company=member.company).order_by("-year", "kind")

    def create(self, request):
        member = membership(request)
        require_hr(member)
        data = CycleSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        obj = data.save(company=member.company)
        record(member, "cycle.created", obj)
        return Response(CycleSerializer(obj).data, status=201)

    @action(detail=True)
    def preview(self, request, pk=None):
        cycle = self.get_object()
        people = EmployeeProfile.objects.filter(
            company=cycle.company, membership__active=True
        ).select_related("membership__user", "reporting")
        reviewers = Membership.objects.filter(
            company=cycle.company, is_head_hr=True, active=True
        ).select_related("user")
        return Response(
            {
                "people": [
                    {
                        "id": p.id,
                        "name": p.membership.user.get_full_name(),
                        "has_manager": hasattr(p, "reporting"),
                    }
                    for p in people
                ],
                "reviewers": [{"id": m.id, "name": m.user.get_full_name()} for m in reviewers],
            }
        )

    @action(detail=True, methods=["post"])
    def launch(self, request, pk=None):
        obj = services.launch_cycle(
            membership(request), self.get_object(), **validated(LaunchSerializer, request)
        )
        return Response(CycleSerializer(obj).data)


class ReviewViewSet(CoachingActions, ComparisonActions, viewsets.ReadOnlyModelViewSet):
    serializer_class = ReviewSerializer

    def get_queryset(self):
        qs = services.visible_reviews(membership(self.request))
        if self.request.query_params.get("appointed") == "true":
            qs = qs.filter(reviewer=membership(self.request))
        for field in ["state", "employee", "manager", "cycle"]:
            if self.request.query_params.get(field):
                qs = qs.filter(**{field: self.request.query_params[field]})
        if self.request.query_params.get("department"):
            qs = qs.filter(employee__department_id=self.request.query_params["department"])
        if self.request.query_params.get("overdue") == "true":
            qs = qs.filter(cycle__due_on__lt=timezone.localdate()).exclude(state="FINALISED")
        return qs.order_by("-cycle__year", "employee__membership__user__first_name", "id")

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        member = membership(request)
        data = ReviewSerializer(obj).data
        # General HR can monitor status; narrative requires a participant or explicit appointment.
        participant = member.id in [obj.employee.membership_id, obj.manager.membership_id, obj.reviewer_id]
        if not participant:
            return Response(data)
        forms = services.current_forms(obj)
        visible = []
        for form in forms:
            own = form.author_id == member.id
            shared = bool(form.submitted_at) and (
                form.kind == "EMPLOYEE"
                or member.id != obj.employee.membership_id
                or obj.state in ["SUBMITTED", "CONVERSATION_READY", "ACKNOWLEDGEMENT_PENDING", "FINALISED"]
            )
            if own or shared:
                visible.append(
                    {
                        "kind": form.kind,
                        "content": form.content,
                        "evidence_ids": list(form.evidence.values_list("id", flat=True)),
                        "submitted_at": form.submitted_at,
                        "round": form.round,
                    }
                )
        data["forms"] = visible
        data["employee_comments"] = obj.employee_comments
        data["history"] = list(
            obj.events.order_by("created_at").values("action", "reason", "version", "created_at")
        )
        from apps.evidence.models import EvidenceItem
        from apps.evidence.views import EvidenceSerializer

        ids = forms.filter(submitted_at__isnull=False).values_list("evidence__id", flat=True)
        data["evidence"] = EvidenceSerializer(EvidenceItem.objects.filter(id__in=ids), many=True).data
        if obj.state in ["ACKNOWLEDGEMENT_PENDING", "FINALISED"] or member.id == obj.reviewer_id:
            data["conversation"] = obj.conversation
            data["hr_assessment"] = obj.hr_assessment
            data["commitments"] = list(
                obj.commitments.values(
                    "id",
                    "owner_id",
                    "action",
                    "manager_support",
                    "success_measure",
                    "due_date",
                    "status",
                    "version",
                )
            )
        if obj.state == "FINALISED":
            data["snapshot"] = {"sha256": obj.snapshot.sha256, "content": obj.snapshot.content}
        if obj.prior_midyear_id:
            data["midyear_baseline"] = obj.prior_midyear.snapshot.content
        return Response(data)

    @action(detail=True, methods=["post"], url_path="employee-reflection")
    def employee_reflection(self, request, pk=None):
        obj = services.save_form(
            membership(request), self.get_object(), "EMPLOYEE", **validated(SaveFormSerializer, request)
        )
        return Response(ReviewSerializer(obj).data)

    @action(detail=True, methods=["post"], url_path="manager-assessment")
    def manager_assessment(self, request, pk=None):
        obj = services.save_form(
            membership(request), self.get_object(), "MANAGER", **validated(SaveFormSerializer, request)
        )
        return Response(ReviewSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def conversation(self, request, pk=None):
        obj = services.prepare_conversation(
            membership(request), self.get_object(), **validated(ConversationSerializer, request)
        )
        return Response(ReviewSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        obj = services.acknowledge(
            membership(request), self.get_object(), **validated(AcknowledgementSerializer, request)
        )
        return Response(ReviewSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def revision(self, request, pk=None):
        obj = services.request_revision(
            membership(request), self.get_object(), **validated(RevisionSerializer, request)
        )
        return Response(ReviewSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        obj = services.finalise(
            membership(request), self.get_object(), **validated(VersionSerializer, request)
        )
        return Response(ReviewSerializer(obj).data)
