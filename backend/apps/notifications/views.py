from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import membership

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "path", "created_at", "read_at"]


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        member = membership(self.request)
        return Notification.objects.filter(company=member.company, recipient=member.user).order_by(
            "-created_at"
        )

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        obj = self.get_object()
        obj.read_at = timezone.now()
        obj.save(update_fields=["read_at"])
        return Response(NotificationSerializer(obj).data)
