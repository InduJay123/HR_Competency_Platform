from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.services import record
from apps.tasks.services import visible_work
from common.permissions import membership

from . import storage
from .models import EvidenceItem
from .services import add_evidence, validate_evidence


class EvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvidenceItem
        fields = [
            "id",
            "task",
            "title",
            "kind",
            "note",
            "link",
            "mime_type",
            "sha256",
            "size",
            "validation",
            "authorised_excerpt",
            "validation_reason",
            "created_at",
        ]


class CreateSerializer(serializers.Serializer):
    task = serializers.UUIDField()
    title = serializers.CharField(max_length=180)
    kind = serializers.ChoiceField(choices=["NOTE", "LINK", "FILE"])
    note = serializers.CharField(max_length=20000, required=False, allow_blank=True)
    link = serializers.URLField(required=False, allow_blank=True)


class ValidationSerializer(serializers.Serializer):
    validation = serializers.ChoiceField(choices=["VALIDATED", "EXCLUDED"])
    authorised_excerpt = serializers.CharField(max_length=20000, required=False, allow_blank=True)
    validation_reason = serializers.CharField(max_length=4000)


class EvidenceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = EvidenceSerializer

    def get_queryset(self):
        member = membership(self.request)
        qs = EvidenceItem.objects.filter(company=member.company, task__in=visible_work(member))
        if self.request.query_params.get("task"):
            qs = qs.filter(task_id=self.request.query_params["task"])
        if self.request.query_params.get("employee"):
            qs = qs.filter(task__assigned_to_id=self.request.query_params["employee"])
        return qs.order_by("-created_at")

    def create(self, request):
        data = CreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        member = membership(request)
        values = dict(data.validated_data)
        task = get_object_or_404(visible_work(member), pk=values.pop("task"))
        obj = add_evidence(member, task, values, request.FILES.get("file"))
        return Response(EvidenceSerializer(obj).data, status=201)

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        obj = self.get_object()
        data = ValidationSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            EvidenceSerializer(validate_evidence(membership(request), obj, data.validated_data)).data
        )

    @action(detail=True)
    def download(self, request, pk=None):
        obj = self.get_object()
        if not obj.storage_key:
            raise ValidationError("This evidence has no uploaded file.")
        body = storage.get(obj.storage_key)
        record(membership(request), "evidence.downloaded", obj)
        response = HttpResponse(body, content_type="application/octet-stream")
        extension = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}.get(
            obj.mime_type, "bin"
        )
        response["Content-Disposition"] = f'attachment; filename="evidence-{obj.id}.{extension}"'
        response["Cache-Control"] = "no-store, private"
        response["X-Content-Type-Options"] = "nosniff"
        return response
