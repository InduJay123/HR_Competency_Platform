from django.db import transaction
from django.db.models import Q
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.audit.services import record
from common.exceptions import Conflict
from common.permissions import membership

from .models import Commitment, CommitmentUpdate


class CommitmentSerializer(serializers.ModelSerializer):
    can_update = serializers.SerializerMethodField()
    can_create_work = serializers.SerializerMethodField()

    def get_can_update(self, obj):
        actor = membership(self.context["request"])
        return actor.id in [
            obj.employee.membership_id,
            obj.owner.membership_id,
            obj.review.manager.membership_id,
        ]

    def get_can_create_work(self, obj):
        return membership(self.context["request"]).id == obj.review.manager.membership_id

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
        ]


class ProgressSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    notes = serializers.CharField(max_length=10000)
    status = serializers.ChoiceField(choices=["NOT_STARTED", "IN_PROGRESS", "SUPPORT_NEEDED", "COMPLETE"])
    evidence_ids = serializers.ListField(child=serializers.UUIDField(), max_length=30, default=list)


class CommitmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CommitmentSerializer

    def get_queryset(self):
        member = membership(self.request)
        qs = Commitment.objects.filter(company=member.company, review__state="FINALISED")
        if not member.is_hr:
            qs = qs.filter(
                Q(employee__membership=member)
                | Q(owner__membership=member)
                | Q(review__manager__membership=member)
            )
        return qs.order_by("due_date", "id")

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
                    "evidence_ids": list(u.evidence.values_list("id", flat=True)),
                }
                for u in obj.updates.order_by("-created_at")[:100]
            ]
        )

    @action(detail=True, methods=["post"], url_path="create-work")
    @transaction.atomic
    def create_work(self, request, pk=None):
        from apps.tasks.services import assign_work

        obj = self.get_object()
        member = membership(request)
        if member.id != obj.review.manager.membership_id:
            raise PermissionDenied("Only the reviewing manager can assign development work.")
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
        if member.id not in [
            obj.employee.membership_id,
            obj.owner.membership_id,
            obj.review.manager.membership_id,
        ]:
            raise PermissionDenied("Only the employee, owner or assigned manager can record follow-up.")
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
            raise ValidationError("Evidence must belong to this employee and organisation.")
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
