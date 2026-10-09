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
    @action(detail=True, methods=["get"], url_path="accepted-coaching")
    def accepted_coaching(self, request, pk=None):
        from django.shortcuts import get_object_or_404

        from common.permissions import membership

        member = membership(request)
        review = get_object_or_404(
            self.get_queryset(), employee__membership=member, pk=pk
        )
        analysis = (
            review.analyses.filter(
                company=member.company, round=review.round, state="SUCCEEDED", decision="ACCEPTED"
            )
            .order_by("-reviewed_at", "-created_at", "-id")
            .first()
        )
        if analysis is None:
            return Response({"available": False, "coaching": None})
        coaching = {
            group: [
                {key: item[key] for key in ("observation", "source_ids", "question", "uncertainty")}
                for item in analysis.output.get(group, [])
            ]
            for group in ("strengths", "gaps", "support_options")
        }
        coaching["limitations"] = analysis.output.get("limitations", [])
        labels = {
            "EMPLOYEE_SUBMISSION": "Employee reflection",
            "MANAGER_SUBMISSION": "Manager appraisal",
            "VALIDATED_EVIDENCE": "Validated evidence",
        }
        cited = {
            source_id
            for group in ("strengths", "gaps", "support_options")
            for item in coaching[group]
            for source_id in item["source_ids"]
        }
        sources = {
            source["id"]: labels[source["type"]]
            for source in analysis.input_snapshot.get("sources", [])
            if source.get("id") in cited and source.get("type") in labels
        }
        return Response({
            "available": True,
            "coaching": coaching,
            "reviewed_at": analysis.reviewed_at,
            "sources": sources,
        })

    @action(detail=True, methods=["get", "post"], url_path="ai-coaching")
    def ai_coaching(self, request, pk=None):
        from apps.reviews.serializers import VersionSerializer
        from apps.reviews.workflow import require_content_access
        from common.permissions import membership

        member, review = membership(request), self.get_object()
        require_content_access(member, review)
        if request.method == "GET":
            return Response(
                {
                    "configured": services.configured(),
                    "analyses": AnalysisSerializer(review.analyses.filter(company=member.company).order_by("-created_at"), many=True).data,
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
