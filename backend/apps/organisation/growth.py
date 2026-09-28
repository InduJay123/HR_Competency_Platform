from django.db import transaction
from django.db.models import Q
from rest_framework import serializers, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.audit.services import record
from common.exceptions import Conflict
from common.permissions import membership

from .models import GrowthEntry
from .services import is_direct_report

CATEGORIES = {
    "CONTRIBUTION": ["Mentoring", "Knowledge sharing", "Systems & culture", "Other contribution"],
    "CAPABILITY": [
        "Technical Expertise",
        "Relational Intelligence",
        "Strategic Judgment",
        "Emotional Cadence",
    ],
    "LEGACY": ["People", "Knowledge", "Systems", "Culture"],
}


class GrowthSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.user.get_full_name", read_only=True)
    can_edit = serializers.SerializerMethodField()
    perspective = serializers.SerializerMethodField()

    def get_can_edit(self, obj):
        return obj.owner_id == membership(self.context["request"]).id

    def get_perspective(self, obj):
        return "SELF" if obj.owner_id == obj.subject.membership_id else "MANAGER"

    class Meta:
        model = GrowthEntry
        fields = [
            "id",
            "subject",
            "kind",
            "category",
            "title",
            "details",
            "outcome",
            "support",
            "evidence_url",
            "shared",
            "archived",
            "version",
            "owner_name",
            "can_edit",
            "perspective",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "version", "created_at", "updated_at"]
        extra_kwargs = {"subject": {"required": False}}

    def validate(self, values):
        member = membership(self.context["request"])
        subject = values.get("subject", self.instance.subject if self.instance else member.profile)
        kind = values.get("kind", self.instance.kind if self.instance else None)
        category = values.get("category", self.instance.category if self.instance else None)
        if category not in CATEGORIES.get(kind, []):
            raise serializers.ValidationError("Choose a category for this growth tool.")
        if self.instance and (subject.id != self.instance.subject_id or kind != self.instance.kind):
            raise serializers.ValidationError("The record owner and tool cannot be changed.")
        if subject.company_id != member.company_id:
            raise PermissionDenied("This person is not available in your workspace.")
        if subject.membership_id != member.id:
            if kind != "CAPABILITY" or not is_direct_report(member, subject):
                raise PermissionDenied("You can add capability observations only for your direct reports.")
            values["shared"] = True
        if values.get("evidence_url") and not values["evidence_url"].startswith("https://"):
            raise serializers.ValidationError("Evidence links must use HTTPS.")
        values["subject"] = subject
        return values


class GrowthViewSet(viewsets.ModelViewSet):
    serializer_class = GrowthSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        member = membership(self.request)
        qs = GrowthEntry.objects.select_related("owner__user", "subject__membership").filter(
            company=member.company
        )
        qs = qs.filter(
            Q(subject__membership=member)
            | Q(owner=member)
            | Q(shared=True, subject__reporting__manager__membership=member)
        )
        if self.action == "list":
            subject = self.request.query_params.get("subject", str(member.profile.id))
            try:
                subject = serializers.UUIDField().run_validation(subject)
            except serializers.ValidationError:
                return qs.none()
            qs = qs.filter(subject_id=subject, archived=self.request.query_params.get("archived") == "true")
            if self.request.query_params.get("category"):
                qs = qs.filter(category=self.request.query_params["category"])
            perspective = self.request.query_params.get("perspective")
            if perspective == "SELF":
                qs = qs.filter(owner__profile__id=subject)
            elif perspective == "MANAGER":
                qs = qs.exclude(owner__profile__id=subject)
            if self.request.query_params.get("kind"):
                qs = qs.filter(kind=self.request.query_params["kind"])
        return qs.order_by("-updated_at", "id")

    def perform_create(self, serializer):
        member = membership(self.request)
        obj = serializer.save(company=member.company, owner=member)
        record(member, "growth.created", obj)

    def partial_update(self, request, pk=None):
        obj = self.get_object()
        member = membership(request)
        if obj.owner_id != member.id:
            raise PermissionDenied("Only the author can edit this observation.")
        with transaction.atomic():
            obj = GrowthEntry.objects.select_for_update().get(pk=obj.id)
            if request.data.get("version") != obj.version:
                raise Conflict()
            serializer = self.get_serializer(obj, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save(version=obj.version + 1)
            record(member, "growth.updated", obj)
        return Response(serializer.data)
