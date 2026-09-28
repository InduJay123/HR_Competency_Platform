from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import membership, require_manager

from .serializers import (
    ProgressSerializer,
    WorkCreateSerializer,
    WorkEditSerializer,
    WorkSerializer,
    WorkUpdateSerializer,
)
from .services import assign_work, edit_work, progress_work, visible_work


class WorkViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkSerializer

    def get_queryset(self):
        member = membership(self.request)
        qs = visible_work(member)
        if self.action == "my_tasks":
            qs = qs.filter(assigned_to__membership=member)
        elif self.action == "team":
            require_manager(member)
            qs = qs.filter(assigned_to__reporting__manager__membership=member)
        if self.request.query_params.get("status"):
            qs = qs.filter(status=self.request.query_params["status"])
        if self.request.query_params.get("overdue") == "true":
            qs = qs.filter(due_date__lt=timezone.localdate()).exclude(status__in=["DONE", "CANCELLED"])
        return qs.order_by("due_date", "id")

    def create(self, request):
        data = WorkCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            WorkSerializer(assign_work(membership(request), data.validated_data)).data, status=201
        )

    def partial_update(self, request, pk=None):
        obj = self.get_object()
        data = WorkEditSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(WorkSerializer(edit_work(membership(request), obj, data.validated_data)).data)

    @action(detail=False, url_path="my-tasks")
    def my_tasks(self, request):
        return self.list(request)

    @action(detail=False)
    def team(self, request):
        return self.list(request)

    @action(detail=True, methods=["get", "post"])
    def updates(self, request, pk=None):
        obj = self.get_object()
        if request.method == "GET":
            page = self.paginate_queryset(obj.updates.all())
            return self.get_paginated_response(WorkUpdateSerializer(page, many=True).data)
        data = ProgressSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(WorkSerializer(progress_work(membership(request), obj, data.validated_data)).data)

    @action(detail=True, methods=["post"])
    def delegate(self, request, pk=None):
        obj = self.get_object()
        data = WorkCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            WorkSerializer(assign_work(membership(request), data.validated_data, parent=obj)).data, status=201
        )
