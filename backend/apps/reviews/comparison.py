from django.db import transaction
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from common.permissions import membership

from .services import lock, touch


class ComparisonSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    commitment_id = serializers.UUIDField()
    outcome = serializers.ChoiceField(choices=["MET", "PARTIALLY_MET", "MISSED"])
    rationale = serializers.CharField(max_length=10000)


class ComparisonActions:
    @action(detail=True, methods=["get", "post"])
    def comparison(self, request, pk=None):
        review = self.get_object()
        member = membership(request)
        if member.id not in [review.employee.membership_id, review.manager.membership_id, review.reviewer_id]:
            raise PermissionDenied("Only review participants can access the comparison.")
        if not review.prior_midyear_id:
            raise ValidationError("This review has no prior Mid-Year baseline.")
        baseline = review.prior_midyear.snapshot.content.get("commitments", [])
        if request.method == "POST":
            data = ComparisonSerializer(data=request.data)
            data.is_valid(raise_exception=True)
            values = data.validated_data
            with transaction.atomic():
                review = lock(member, review, values["version"])
                if member.id != review.manager.membership_id or review.state not in [
                    "OPEN",
                    "PREPARING",
                    "REVISION_REQUESTED",
                ]:
                    raise PermissionDenied(
                        "The assigned manager records comparison outcomes before formal submission."
                    )
                if review.submissions.filter(
                    round=review.round, kind="MANAGER", submitted_at__isnull=False
                ).exists():
                    raise ValidationError(
                        "The manager appraisal is sealed. Request a revision to change comparison outcomes."
                    )
                key = str(values["commitment_id"])
                if key not in {str(c["id"]) for c in baseline}:
                    raise ValidationError("Commitment does not belong to the preserved Mid-Year record.")
                review.comparison = {
                    **review.comparison,
                    key: {
                        "outcome": values["outcome"],
                        "rationale": values["rationale"],
                        "author": str(member.id),
                    },
                }
                touch(member, review, "comparison.saved")
        show = (
            member.id == review.manager.membership_id
            or review.state in ["ACKNOWLEDGEMENT_PENDING", "FINALISED"]
            or (
                member.id == review.reviewer_id
                and review.submissions.filter(
                    kind="MANAGER", round=review.round, submitted_at__isnull=False
                ).exists()
            )
        )
        return Response(
            {"baseline": baseline, "outcomes": review.comparison if show else {}, "version": review.version}
        )
