"""Tenant-scoped target setup and immutable review source capture."""

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.audit.services import record
from apps.organisation.models import EmployeeProfile
from common.exceptions import Conflict
from common.permissions import membership

from .models import PillarTarget, ReviewCycle


def require_head(member):
    if not member.active or not member.is_head_hr:
        raise PermissionDenied("Only the active Head of HR can set cycle targets.")


class TargetSerializer(serializers.ModelSerializer):
    cycle_name = serializers.SerializerMethodField()
    employee_name = serializers.CharField(source="employee.membership.user.get_full_name")

    def get_cycle_name(self, obj):
        return f"{obj.cycle.get_kind_display()} {obj.cycle.year}"

    class Meta:
        model = PillarTarget
        fields = [
            "id",
            "cycle",
            "cycle_name",
            "employee",
            "employee_name",
            "pillar",
            "target",
            "success_measure",
            "notes",
            "completed_at",
            "version",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TargetRowSerializer(serializers.Serializer):
    pillar = serializers.ChoiceField(choices=PillarTarget.Pillar.choices)
    target = serializers.CharField(max_length=6000, allow_blank=True)
    success_measure = serializers.CharField(max_length=6000, allow_blank=True)
    notes = serializers.CharField(max_length=6000, allow_blank=True, default="")
    version = serializers.IntegerField(min_value=0)


class TargetSetupSerializer(serializers.Serializer):
    employee = serializers.UUIDField()
    targets = TargetRowSerializer(many=True)
    complete = serializers.BooleanField(default=False)


class TargetViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TargetSerializer

    def get_queryset(self):
        member = membership(self.request)
        qs = PillarTarget.objects.filter(company=member.company).select_related(
            "cycle", "employee__membership__user"
        )
        if not member.is_head_hr:
            qs = qs.filter(employee__membership=member, completed_at__isnull=False)
        if self.request.query_params.get("own") == "true":
            qs = qs.filter(employee__membership=member)
        for field in ("cycle", "employee"):
            if self.request.query_params.get(field):
                value = serializers.UUIDField().run_validation(self.request.query_params[field])
                qs = qs.filter(**{field: value})
        if self.request.query_params.get("active") == "true":
            today = timezone.localdate()
            qs = qs.filter(
                completed_at__isnull=False,
                cycle__started_at__isnull=False,
                cycle__launched_at__isnull=True,
                cycle__starts_on__lte=today,
                cycle__ends_on__gte=today,
            )
        return qs.order_by("cycle__year", "cycle__kind", "employee_id", "pillar")


def validate_setup(cycle):
    rows = list(cycle.targets.all())
    employees = {r.employee_id for r in rows}
    if not employees:
        raise ValidationError("Set and complete five targets for at least one employee first.")
    for employee in employees:
        group = [r for r in rows if r.employee_id == employee]
        if {r.pillar for r in group} != set(PillarTarget.Pillar.values) or any(
            not r.completed_at or not r.target.strip() or not r.success_measure.strip() for r in group
        ):
            raise ValidationError(
                {"employee": str(employee), "detail": "Complete all five target and success measure pairs."}
            )
    return employees


class TargetActions:
    @action(detail=True, methods=["post"], url_path="targets")
    @transaction.atomic
    def targets(self, request, pk=None):
        member = membership(request)
        require_head(member)
        cycle = ReviewCycle.objects.select_for_update().get(pk=self.get_object().pk)
        if cycle.workflow_version != 2 or cycle.launched_at:
            raise ValidationError(
                "Targets are locked once formal reviews open; legacy cycles retain their original workflow."
            )
        data = TargetSetupSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        employee = EmployeeProfile.objects.filter(
            pk=values["employee"],
            company=member.company,
            membership__active=True,
            membership__is_head_hr=False,
        ).first()
        if not employee:
            raise ValidationError("Choose an active employee in your company, excluding Head of HR.")
        rows = values["targets"]
        if len(rows) != 5 or {r["pillar"] for r in rows} != set(PillarTarget.Pillar.values):
            raise ValidationError("Provide each of the five pillars exactly once.")
        existing = {r.pillar: r for r in cycle.targets.filter(employee=employee)}
        if cycle.started_at and not existing:
            raise ValidationError("Participants are fixed when the cycle starts.")
        if values["complete"] and any(
            not r["target"].strip() or not r["success_measure"].strip() for r in rows
        ):
            raise ValidationError("Every pillar requires a target and success measure.")
        before = list(cycle.targets.filter(employee=employee).values())
        for row in rows:
            obj = existing.get(row["pillar"])
            version = row.pop("version")
            if version != (obj.version if obj else 0):
                raise Conflict()
            if not obj:
                obj = PillarTarget(
                    company=member.company,
                    cycle=cycle,
                    employee=employee,
                    created_by=member,
                    pillar=row["pillar"],
                )
            else:
                obj.version += 1
            for key in ("target", "success_measure", "notes"):
                setattr(obj, key, row[key])
            obj.completed_at = timezone.now() if values["complete"] else None
            obj.save()
        after = list(cycle.targets.filter(employee=employee).values())
        # record() stores JSON; normalize UUID/date values without losing previous content.
        import json

        record(
            member,
            "cycle.targets_saved",
            cycle,
            employee=str(employee.id),
            before=json.loads(json.dumps(before, default=str)),
            after=json.loads(json.dumps(after, default=str)),
        )
        return Response(TargetSerializer(cycle.targets.filter(employee=employee), many=True).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def start(self, request, pk=None):
        member = membership(request)
        require_head(member)
        cycle = ReviewCycle.objects.select_for_update().get(pk=self.get_object().pk)
        if cycle.workflow_version != 2 or cycle.started_at or cycle.launched_at:
            raise ValidationError("Only a new pillar cycle can be started.")
        validate_setup(cycle)
        cycle.started_at = timezone.now()
        cycle.save(update_fields=["started_at", "updated_at"])
        record(member, "cycle.started", cycle)
        from apps.notifications.services import notify

        for employee in EmployeeProfile.objects.filter(
            company=member.company, id__in=cycle.targets.values("employee_id")
        ).select_related("membership__user"):
            notify(
                member.company,
                employee.membership.user,
                f"cycle:{cycle.id}:targets:{employee.id}",
                "Your cycle targets are ready",
                "/employee/reviews",
            )
        from .serializers import CycleSerializer

        return Response(CycleSerializer(cycle).data)


def capture_pillars(cycle, employee):
    result = []
    for pillar in PillarTarget.Pillar.values:
        target = cycle.targets.get(employee=employee, pillar=pillar)
        result.append(
            {
                "id": str(target.id),
                "pillar": pillar,
                "target": target.target,
                "success_measure": target.success_measure,
                "notes": target.notes,
                "version": target.version,
            }
        )
    return result
