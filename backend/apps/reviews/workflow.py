"""Derived workflow state; historical records are never backfilled or rewritten."""

from rest_framework.exceptions import PermissionDenied


def require_participant(member, review):
    if member.id == review.employee.membership_id:
        return "employee"
    if member.id == review.manager.membership_id:
        return "manager"
    raise PermissionDenied("Only the employee or assigned manager can confirm their own participation.")


def require_content_access(member, review):
    if not member.is_head_hr and member.id not in (
        review.employee.membership_id,
        review.manager.membership_id,
        review.reviewer_id,
    ):
        raise PermissionDenied("Review content is private to its participants and Head of HR.")


def confirmations(review):
    value = review.conversation.get("workflow", {})
    return value if value.get("round") == review.round else {"round": review.round}


def workflow_status(review):
    submitted = set(
        review.submissions.filter(round=review.round, submitted_at__isnull=False).values_list(
            "kind", flat=True
        )
    )
    analyses = review.analyses.filter(company_id=review.company_id, round=review.round)
    complete = analyses.filter(state="SUCCEEDED").exists()
    latest = analyses.order_by("-created_at", "-id").first()
    if complete:
        ai = "Complete"
    elif "EMPLOYEE" not in submitted:
        ai = "Waiting for employee reflection"
    elif "MANAGER" not in submitted:
        ai = "Waiting for manager appraisal"
    elif latest and latest.state in ("QUEUED", "RUNNING", "RETRYING"):
        ai = "Running"
    elif latest and latest.state == "FAILED":
        ai = "Failed / retry" if latest.attempts < 3 else "Failed / retry limit reached"
    else:
        ai = "Ready"
    marks = confirmations(review)
    conversation = all(marks.get(f"{role}_participation") for role in ("employee", "manager"))
    commitments = review.commitments.exists() and all(
        marks.get(f"{role}_commitments") for role in ("employee", "manager")
    )
    requirements = [
        ("Employee reflection", "EMPLOYEE" in submitted),
        ("Manager appraisal", "MANAGER" in submitted),
        ("AI coaching", complete),
        ("Employee conversation participation", marks.get("employee_participation")),
        ("Manager conversation participation", marks.get("manager_participation")),
        ("Commitments confirmation", commitments),
        ("Employee acknowledgement", review.employee_ack),
        ("Manager acknowledgement", review.manager_ack),
        (
            "Final human assessment",
            review.hr_assessment.get("overall") and review.hr_assessment.get("rationale"),
        ),
    ]
    evidence_pending = review.submissions.filter(round=review.round, evidence__validation="PENDING").exists()
    if evidence_pending:
        requirements.append(("Evidence validation", False))
    return {
        "employee_submitted": "EMPLOYEE" in submitted,
        "manager_submitted": "MANAGER" in submitted,
        "ai_coaching": ai,
        "ai_blocked_reason": "Head of HR must validate or exclude submitted evidence first."
        if evidence_pending and not complete
        else "",
        "conversation_complete": bool(conversation),
        "commitments_complete": bool(commitments),
        "confirmations": marks,
        "missing": [label for label, satisfied in requirements if not satisfied],
    }
