from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .models import Analysis


class AnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = Analysis
        fields = [
            "id",
            "round",
            "input_hash",
            "prompt_version",
            "model",
            "state",
            "attempts",
            "output",
            "error_code",
            "decision",
            "decision_notes",
            "created_at",
            "reviewed_at",
        ]


class DecisionSerializer(serializers.Serializer):
    analysis_id = serializers.UUIDField()
    decision = serializers.ChoiceField(choices=["ACCEPTED", "REJECTED"])
    notes = serializers.CharField(max_length=5000)


class CoachingActions:
    @action(detail=True, methods=["get", "post"], url_path="ai-coaching")
    def ai_coaching(self, request, pk=None):
        from apps.reviews.serializers import VersionSerializer
        from apps.reviews.services import require_reviewer
        from common.permissions import membership

        member, review = membership(request), self.get_object()
        require_reviewer(member, review)
        if request.method == "GET":
            return Response(
                {
                    "configured": services.configured(),
                    "analyses": AnalysisSerializer(review.analyses.order_by("-created_at"), many=True).data,
                }
            )
        data = VersionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        obj = services.request_analysis(member, review, **data.validated_data)
        return Response(AnalysisSerializer(obj).data, status=202)

    @action(detail=True, methods=["post"], url_path="ai-decision")
    def ai_decision(self, request, pk=None):
        from common.permissions import membership

        data = DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        obj = services.decide(membership(request), self.get_object(), **data.validated_data)
        return Response(AnalysisSerializer(obj).data)
