from rest_framework import serializers

from .models import Review, ReviewCycle


class CycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewCycle
        fields = ["id", "year", "kind", "starts_on", "ends_on", "due_on", "launched_at"]
        read_only_fields = ["launched_at"]

    def validate(self, data):
        start, end, due = data["starts_on"], data["ends_on"], data["due_on"]
        if start > end or due < end or start.year != data["year"] or end.year != data["year"]:
            raise serializers.ValidationError(
                "Use a valid period within the cycle year and a deadline on or after its end."
            )
        if data["kind"] == "MID_YEAR" and (start.month != 1 or end.month != 6):
            raise serializers.ValidationError("Mid-Year covers January to June.")
        if data["kind"] == "YEAR_END" and (start.month != 7 or end.month != 12):
            raise serializers.ValidationError(
                "Year-End covers July to December, with the Mid-Year baseline alongside it."
            )
        return data


class LaunchSerializer(serializers.Serializer):
    employee_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=500)
    reviewer_id = serializers.UUIDField()


class ReviewSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.membership.user.get_full_name", read_only=True)
    manager_name = serializers.CharField(source="manager.membership.user.get_full_name", read_only=True)
    cycle_detail = CycleSerializer(source="cycle", read_only=True)
    senior_leader = serializers.BooleanField(source="employee.senior_leader", read_only=True)
    employee_member = serializers.UUIDField(source="employee.membership_id", read_only=True)
    manager_member = serializers.UUIDField(source="manager.membership_id", read_only=True)

    class Meta:
        model = Review
        fields = [
            "id",
            "senior_leader",
            "employee_member",
            "manager_member",
            "employee",
            "employee_name",
            "manager",
            "manager_name",
            "reviewer",
            "cycle_detail",
            "prior_midyear",
            "state",
            "round",
            "version",
            "employee_ack",
            "manager_ack",
            "finalised_at",
        ]


class SaveFormSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    content = serializers.JSONField()
    evidence_ids = serializers.ListField(child=serializers.UUIDField(), default=list, max_length=100)
    submit = serializers.BooleanField(default=False)


class VersionSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)


class RevisionSerializer(VersionSerializer):
    reason = serializers.CharField(max_length=4000)


class AcknowledgementSerializer(VersionSerializer):
    comments = serializers.CharField(max_length=10000, required=False, allow_blank=True, default="")


class CommitmentSerializer(serializers.Serializer):
    owner = serializers.UUIDField()
    action = serializers.CharField(max_length=4000)
    manager_support = serializers.CharField(max_length=4000)
    success_measure = serializers.CharField(max_length=4000)
    due_date = serializers.DateField()


class HrAssessmentSerializer(serializers.Serializer):
    overall = serializers.ChoiceField(
        choices=["Exceptional Steward", "Strong Steward", "Developing Steward", "Stewardship at Risk"]
    )
    rationale = serializers.CharField(max_length=20000)
    human_only_reason = serializers.CharField(max_length=4000, required=False, allow_blank=True)


class ConversationSerializer(VersionSerializer):
    discussion = serializers.CharField(max_length=20000)
    assessment = HrAssessmentSerializer()
    commitments = CommitmentSerializer(many=True)
