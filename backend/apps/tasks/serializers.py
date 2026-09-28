from rest_framework import serializers

from .models import WorkItem, WorkUpdate


class WorkCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=180)
    description = serializers.CharField(max_length=10000, required=False, allow_blank=True)
    expected_outcome = serializers.CharField(max_length=5000)
    assigned_to = serializers.UUIDField()
    due_date = serializers.DateField()
    priority = serializers.ChoiceField(choices=["LOW", "MEDIUM", "HIGH"], default="MEDIUM")
    type = serializers.ChoiceField(choices=["WORK", "DEVELOPMENT"], default="WORK")


class WorkEditSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    title = serializers.CharField(max_length=180, required=False)
    expected_outcome = serializers.CharField(max_length=5000, required=False)
    due_date = serializers.DateField(required=False)
    priority = serializers.ChoiceField(choices=["LOW", "MEDIUM", "HIGH"], required=False)
    status = serializers.ChoiceField(choices=["CANCELLED"], required=False)


class ProgressSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    status = serializers.ChoiceField(choices=["IN_PROGRESS", "BLOCKED", "DONE"])
    notes = serializers.CharField(max_length=10000, allow_blank=True, required=False)
    blocker = serializers.CharField(max_length=5000, allow_blank=True, required=False)
    next_step = serializers.CharField(max_length=5000, allow_blank=True, required=False)
    result = serializers.CharField(max_length=10000, allow_blank=True, required=False)


class WorkUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkUpdate
        fields = ["id", "status", "notes", "blocker", "next_step", "result", "created_at", "submitted_by"]


class WorkSerializer(serializers.ModelSerializer):
    assignee_name = serializers.SerializerMethodField()

    def get_assignee_name(self, obj):
        return obj.assigned_to.membership.user.get_full_name()

    class Meta:
        model = WorkItem
        fields = [
            "id",
            "title",
            "description",
            "expected_outcome",
            "type",
            "assigned_by",
            "accountable_owner",
            "assigned_to",
            "assignee_name",
            "status",
            "priority",
            "due_date",
            "completed_at",
            "parent_task",
            "version",
            "created_at",
            "updated_at",
        ]
