from datetime import timedelta

from django.db import transaction
from django.db.models import BooleanField, Case, Count, Q, Value, When
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.audit.services import record
from apps.organisation.models import Department, EmployeeProfile
from apps.organisation.serializers import EmployeeSerializer
from apps.organisation.services import is_direct_report
from common.exceptions import Conflict
from common.permissions import membership, require_manager

from .models import Commitment, CommitmentUpdate


class CommitmentSerializer(serializers.ModelSerializer):
    can_update = serializers.SerializerMethodField()
    can_create_work = serializers.SerializerMethodField()
    employee_details = serializers.SerializerMethodField()
    owner_name = serializers.CharField(source="owner.membership.user.get_full_name", read_only=True)
    overdue = serializers.SerializerMethodField()

    def get_employee_details(self, obj):
        person = obj.employee
        if hasattr(obj, "employee_has_avatar"):
            person.has_avatar = obj.employee_has_avatar
        return {
            "id": str(person.id),
            "name": person.membership.user.get_full_name(),
            "designation": person.designation,
            "department": person.department.name if person.department else "",
            "photo_url": EmployeeSerializer().get_photo_url(person),
        }

    def get_overdue(self, obj):
        return obj.status != "COMPLETE" and obj.due_date < timezone.localdate()

    def get_can_update(self, obj):
        actor = self.context["member"]
        return is_direct_report(actor, obj.employee) or actor.id in [
            obj.employee.membership_id,
            obj.owner.membership_id,
        ]

    def get_can_create_work(self, obj):
        return is_direct_report(self.context["member"], obj.employee)

    class Meta:
        model = Commitment
        fields = [
            "id",
            "review",
            "employee",
            "owner",
            "action",
            "manager_support",
            "success_measure",
            "due_date",
            "status",
            "work_item",
            "version",
            "can_update",
            "can_create_work",
            "employee_details",
            "owner_name",
            "overdue",
        ]


class ProgressSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    notes = serializers.CharField(max_length=10000)
    status = serializers.ChoiceField(choices=["NOT_STARTED", "IN_PROGRESS", "SUPPORT_NEEDED", "COMPLETE"])
    evidence_ids = serializers.ListField(child=serializers.UUIDField(), max_length=30, default=list)


class CommitmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CommitmentSerializer

    def actor(self):
        if not hasattr(self, "_actor"):
            self._actor = membership(self.request)
        return self._actor

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "member": self.actor()}

    def get_queryset(self):
        member = self.actor()
        qs = (
            Commitment.objects.filter(
                company=member.company,
                review__company=member.company,
                employee__company=member.company,
                owner__company=member.company,
                review__state="FINALISED",
            )
            .select_related("employee__membership__user", "employee__department", "owner__membership__user")
            .defer("employee__avatar_data", "owner__avatar_data")
            .annotate(
                employee_has_avatar=Case(
                    When(employee__avatar_data__isnull=False, then=Value(True)),
                    default=Value(False),
                    output_field=BooleanField(),
                )
            )
        )
        if not member.is_hr:
            qs = qs.filter(
                Q(employee__membership=member)
                | Q(owner__membership=member)
                | Q(review__manager__membership=member)
            )
        if self.action == "list":
            params = self.request.query_params
            for param, field in [("employee", "employee_id"), ("department", "employee__department_id")]:
                if params.get(param):
                    qs = qs.filter(**{field: serializers.UUIDField().run_validation(params[param])})
            if params.get("status"):
                status = serializers.ChoiceField(
                    choices=Commitment._meta.get_field("status").choices
                ).run_validation(params["status"])
                qs = qs.filter(status=status)
            for term in params.get("search", "").strip()[:150].split():
                qs = qs.filter(
                    Q(employee__membership__user__first_name__icontains=term)
                    | Q(employee__membership__user__last_name__icontains=term)
                    | Q(action__icontains=term)
                )
            if params.get("due"):
                due = serializers.ChoiceField(choices=["overdue", "month", "later"]).run_validation(
                    params["due"]
                )
                today = timezone.localdate()
                next_month = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
                if due == "overdue":
                    qs = qs.filter(due_date__lt=today).exclude(status="COMPLETE")
                elif due == "month":
                    qs = qs.filter(due_date__gte=today.replace(day=1), due_date__lt=next_month)
                else:
                    qs = qs.filter(due_date__gte=next_month)
        return qs.order_by("due_date", "id")

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        summary = qs.aggregate(
            total=Count("id"),
            **{
                value: Count("id", filter=Q(status=value))
                for value, _ in Commitment._meta.get_field("status").choices
            },
        )
        page = self.paginate_queryset(qs)
        response = self.get_paginated_response(self.get_serializer(page, many=True).data)
        response.data["summary"] = summary
        response.data["as_of"] = timezone.localdate()
        return response

    @action(detail=False)
    def filters(self, request):
        member = self.actor()
        require_manager(member)
        people = (
            EmployeeProfile.objects.filter(
                company=member.company,
                membership__company=member.company,
                membership__user__is_superuser=False,
            )
            .exclude(membership=member)
            .select_related("membership__user")
            .defer("avatar_data")
        )
        return Response(
            {
                "people": [
                    {"id": str(p.id), "name": p.membership.user.get_full_name(), "designation": p.designation}
                    for p in people.order_by("membership__user__first_name", "id")
                ],
                "departments": list(
                    Department.objects.filter(company=member.company).order_by("name").values("id", "name")
                ),
            }
        )

    @action(detail=True)
    def history(self, request, pk=None):
        obj = self.get_object()
        return Response(
            [
                {
                    "id": u.id,
                    "notes": u.notes,
                    "status": u.status,
                    "created_at": u.created_at,
                    "evidence_ids": [e.id for e in u.evidence.all()],
                }
                for u in obj.updates.filter(company=self.actor().company)
                .prefetch_related("evidence")
                .order_by("-created_at")[:100]
            ]
        )

    @action(detail=True, methods=["post"], url_path="create-work")
    @transaction.atomic
    def create_work(self, request, pk=None):
        from apps.tasks.services import assign_work

        obj = self.get_object()
        member = membership(request)
        if not is_direct_report(member, obj.employee):
            raise PermissionDenied("Only Chief Steward can assign development work.")
        obj = Commitment.objects.select_for_update().get(id=obj.id)
        if obj.work_item_id:
            return Response({"work_item": obj.work_item_id})
        obj.work_item = assign_work(
            member,
            {
                "assigned_to": obj.employee_id,
                "title": obj.action[:180],
                "description": obj.action,
                "expected_outcome": obj.success_measure,
                "due_date": obj.due_date,
                "type": "DEVELOPMENT",
            },
        )
        obj.version += 1
        obj.save(update_fields=["work_item", "version", "updated_at"])
        record(member, "development.work_linked", obj, work_id=str(obj.work_item_id))
        return Response({"work_item": obj.work_item_id}, status=201)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def progress(self, request, pk=None):
        obj = self.get_object()
        member = membership(request)
        if not is_direct_report(member, obj.employee) and member.id not in [
            obj.employee.membership_id,
            obj.owner.membership_id,
        ]:
            raise PermissionDenied("Only the Steward Guy, owner or assigned manager can record follow-up.")
        data = ProgressSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        obj = Commitment.objects.select_for_update().get(id=obj.id)
        if obj.version != data.validated_data["version"]:
            raise Conflict()
        obj.status = data.validated_data["status"]
        obj.version += 1
        obj.save(update_fields=["status", "version", "updated_at"])
        from apps.evidence.models import EvidenceItem

        ids = data.validated_data["evidence_ids"]
        evidence = EvidenceItem.objects.filter(
            id__in=ids, company=member.company, task__assigned_to=obj.employee
        )
        if evidence.count() != len(set(ids)):
            raise ValidationError("Evidence must belong to this Steward Guy and organisation.")
        update = CommitmentUpdate.objects.create(
            company=member.company,
            commitment=obj,
            author=member,
            notes=data.validated_data["notes"],
            status=obj.status,
        )
        update.evidence.set(evidence)
        record(member, "development.progress", obj, status=obj.status)
        return Response(self.get_serializer(obj).data)
