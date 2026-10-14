from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from common.permissions import membership


class ComparisonActions:
    @action(detail=True, methods=["get"])
    def comparison(self, request, pk=None):
        review = self.get_object()
        member = membership(request)
        if member.id not in [review.employee.membership_id, review.responsible_manager.membership_id, review.reviewer_id]:
            raise PermissionDenied("Only review participants can access the comparison.")
        if not review.prior_midyear_id:
            raise ValidationError("This review has no prior Mid-Year baseline.")
        baseline = review.prior_midyear.snapshot.content.get("commitments", [])
        show = (
            member.id == review.responsible_manager.membership_id
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
