import hashlib
import json

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services import record
from apps.companies.models import Company, Membership
from apps.development.models import Commitment
from apps.evidence.models import EvidenceItem
from apps.notifications.services import notify
from apps.organisation.models import EmployeeProfile, ReportingRelationship
from common.exceptions import Conflict
from common.permissions import require_hr

from .models import FinalSnapshot, Review, ReviewCycle, ReviewEvent, Submission
from .schemas import OVERALL, validate_form


def visible_reviews(member):
    qs = Review.objects.filter(company=member.company).select_related(
        "cycle", "employee__membership__user", "manager__membership__user", "reviewer__user"
    )
    if member.is_hr:
        return qs
    return qs.filter(Q(employee__membership=member) | Q(manager__membership=member) | Q(reviewer=member))


def touch(member, review, action, reason=""):
    review.version += 1
    review.save()
    ReviewEvent.objects.create(
        company=member.company,
        review=review,
        actor=member,
        action=action,
        reason=reason,
        version=review.version,
    )
    record(member, f"review.{action}", review, state=review.state, version=review.version)


def lock(member, review, version):
    obj = Review.objects.select_for_update().get(pk=review.pk, company=member.company)
    if obj.state == "FINALISED":
        raise ValidationError("The final record is immutable.")
    if obj.version != version:
        raise Conflict()
    return obj


def require_reviewer(member, review):
    if not member.is_head_hr or review.reviewer_id != member.id or review.employee.membership_id == member.id:
        raise PermissionDenied("Only the independent appointed Head of HR can perform this action.")


def current_forms(review):
    return Submission.objects.filter(review=review, round=review.round)


@transaction.atomic
def launch_cycle(member, cycle, employee_ids, reviewer_id):
    require_hr(member)
    Company.objects.select_for_update().get(id=member.company_id)
    cycle = ReviewCycle.objects.select_for_update().get(pk=cycle.pk, company=member.company)
    if cycle.launched_at:
        raise ValidationError("This cycle has already been launched.")
    reviewer = Membership.objects.filter(
        id=reviewer_id, company=member.company, is_head_hr=True, active=True
    ).first()
    if not reviewer:
        raise ValidationError("Appoint an active Head of HR in this organisation.")
    if not employee_ids or len(employee_ids) != len(set(employee_ids)):
        raise ValidationError("Choose a non-empty set of distinct participants.")
    for employee_id in employee_ids:
        employee = EmployeeProfile.objects.filter(
            id=employee_id, company=member.company, membership__active=True
        ).first()
        reporting = (
            ReportingRelationship.objects.select_related("manager__membership")
            .filter(employee=employee, company=member.company)
            .first()
        )
        if (
            not employee
            or not reporting
            or not reporting.manager.membership.active
            or not reporting.manager.membership.is_manager
        ):
            raise ValidationError("Each participant needs an active reporting manager before launch.")
        if employee.membership_id == reviewer.id:
            raise ValidationError(
                "Head of HR cannot review themselves. Appoint an independent eligible reviewer."
            )
        prior = None
        if cycle.kind == "YEAR_END":
            prior = Review.objects.filter(
                company=member.company,
                employee=employee,
                cycle__year=cycle.year,
                cycle__kind="MID_YEAR",
                state="FINALISED",
            ).first()
            if not prior:
                raise ValidationError(
                    "Finalise the participant’s Mid-Year baseline before launching Year-End."
                )
        review = Review.objects.create(
            company=member.company,
            cycle=cycle,
            employee=employee,
            manager=reporting.manager,
            reviewer=reviewer,
            prior_midyear=prior,
        )
        notify(
            member.company,
            employee.membership.user,
            f"review:{review.id}:opened",
            "Your review is open",
            f"/employee/reviews/{review.id}",
        )
    cycle.launched_at = timezone.now()
    cycle.save(update_fields=["launched_at", "updated_at"])
    record(member, "cycle.launched", cycle, participants=len(employee_ids))
    return cycle


@transaction.atomic
def save_form(member, review, kind, content, evidence_ids, submit, version):
    review = lock(member, review, version)
    expected = review.employee.membership_id if kind == "EMPLOYEE" else review.manager.membership_id
    if member.id != expected:
        raise PermissionDenied("You cannot edit this person’s submission.")
    if review.state not in ["OPEN", "REVISION_REQUESTED", "PREPARING"]:
        raise ValidationError("Forms are closed at this review stage.")
    form, _ = Submission.objects.get_or_create(
        company=member.company, review=review, round=review.round, kind=kind, defaults={"author": member}
    )
    if form.submitted_at:
        raise ValidationError("Submitted forms are read-only. Request a formal revision.")
    if not isinstance(content, dict) or len(json.dumps(content)) > 120000:
        raise ValidationError("Invalid form content or size.")
    evidence = EvidenceItem.objects.filter(
        id__in=evidence_ids,
        company=member.company,
        task__assigned_to=review.employee,
        task__created_at__date__lte=review.cycle.ends_on,
        created_at__date__gte=review.cycle.starts_on,
    )
    if evidence.count() != len(set(evidence_ids)):
        raise ValidationError("Some evidence is outside the employee, tenant or review period.")
    if submit:
        validate_form(kind, content)
        if review.employee.senior_leader:
            from .schemas import text

            for key in ["strategic_outcomes", "leadership_support", "sustainable_systems"]:
                text(content, key)
        if kind == "MANAGER":
            refs = {str(i) for i in evidence_ids}
            if any(
                not set(row.get("evidence_ids", [])).issubset(refs) for row in content["pillars"].values()
            ):
                raise ValidationError("Pillar evidence must also be selected in this submission.")
        if kind == "MANAGER" and review.prior_midyear_id:
            baseline = review.prior_midyear.snapshot.content.get("commitments", [])
            if any(str(c["id"]) not in review.comparison for c in baseline):
                raise ValidationError(
                    "Record the outcome of every preserved Mid-Year commitment before submitting the Year-End appraisal."
                )
    form.content = content
    form.save()
    form.evidence.set(evidence)
    if submit:
        form.submitted_at = timezone.now()
        form.save(update_fields=["submitted_at", "updated_at"])
    review.state = (
        "SUBMITTED" if current_forms(review).filter(submitted_at__isnull=False).count() == 2 else "PREPARING"
    )
    touch(member, review, f"{kind.lower()}.submitted" if submit else f"{kind.lower()}.saved")
    if submit:
        notify(
            member.company,
            review.reviewer.user,
            f"review:{review.id}:{review.round}:{kind}:submitted",
            "A review submission is ready",
            f"/hr/reviews/{review.id}",
        )
    return review


def evidence_ready(review):
    ids = list(current_forms(review).values_list("evidence__id", flat=True))
    sources = EvidenceItem.objects.filter(id__in=[i for i in ids if i])
    if sources.filter(validation="PENDING").exists():
        raise ValidationError("Validate or exclude every submitted evidence item first.")
    return sources


@transaction.atomic
def prepare_conversation(member, review, version, discussion, assessment, commitments):
    review = lock(member, review, version)
    require_reviewer(member, review)
    if review.state not in ["SUBMITTED", "CONVERSATION_READY"]:
        raise ValidationError("Both employee and manager submissions are required.")
    evidence_ready(review)
    from apps.ai_coach.models import Analysis

    analysis = Analysis.objects.filter(review=review, round=review.round, state="SUCCEEDED").first()
    if analysis and not analysis.decision:
        raise ValidationError(
            "Head of HR must accept or reject the available AI coaching before sharing the conversation record."
        )
    if not analysis and not assessment.get("human_only_reason", "").strip():
        raise ValidationError("Record why this review proceeds without AI coaching.")
    if assessment.get("overall") not in OVERALL or not assessment.get("rationale", "").strip():
        raise ValidationError("Head of HR must record a human overall assessment and rationale.")
    if not discussion.strip():
        raise ValidationError("Record the review conversation.")
    if not 3 <= len(commitments) <= 5:
        raise ValidationError("Agree three to five owned development commitments.")
    # Draft commitments are replaced only before acknowledgement; final snapshots preserve their content.
    Commitment.objects.filter(review=review).delete()
    for item in commitments:
        owner = EmployeeProfile.objects.filter(id=item["owner"], company=member.company).first()
        if owner not in [review.employee, review.manager]:
            raise ValidationError("Commitment owner must be the employee or their reviewing manager.")
        Commitment.objects.create(
            company=member.company,
            review=review,
            employee=review.employee,
            owner=owner,
            action=item["action"],
            manager_support=item["manager_support"],
            success_measure=item["success_measure"],
            due_date=item["due_date"],
        )
    review.hr_assessment = assessment
    review.conversation = {"discussion": discussion}
    review.state = "ACKNOWLEDGEMENT_PENDING"
    review.employee_ack = None
    review.manager_ack = None
    touch(member, review, "acknowledgement.requested")
    for person in [review.employee, review.manager]:
        notify(
            member.company,
            person.membership.user,
            f"review:{review.id}:{review.version}:ack",
            "Review acknowledgement requested",
            f"/employee/reviews/{review.id}",
        )
    return review


@transaction.atomic
def acknowledge(member, review, version, comments=""):
    review = lock(member, review, version)
    if review.state != "ACKNOWLEDGEMENT_PENDING":
        raise ValidationError("Acknowledgement is not open.")
    if member.id == review.employee.membership_id:
        if review.employee_ack:
            raise ValidationError(
                "Your acknowledgement is already recorded. Ask HR for a revision if needed."
            )
        review.employee_ack = timezone.now()
        review.employee_comments = comments
    elif member.id == review.manager.membership_id:
        if comments:
            raise PermissionDenied("Only the employee can record employee comments.")
        if review.manager_ack:
            raise ValidationError("Your acknowledgement is already recorded.")
        review.manager_ack = timezone.now()
    else:
        raise PermissionDenied("Only the employee and assigned manager acknowledge this record.")
    touch(member, review, "acknowledged", comments)
    if review.employee_ack and review.manager_ack:
        notify(
            member.company,
            review.reviewer.user,
            f"review:{review.id}:ready:{review.round}",
            "Review ready for finalisation",
            f"/hr/reviews/{review.id}",
        )
    return review


@transaction.atomic
def request_revision(member, review, version, reason):
    review = lock(member, review, version)
    require_reviewer(member, review)
    if not reason.strip():
        raise ValidationError("A revision reason is required.")
    review.round += 1
    review.state = "REVISION_REQUESTED"
    review.employee_ack = None
    review.manager_ack = None
    review.employee_comments = ""
    review.hr_assessment = {}
    review.conversation = {}
    touch(member, review, "revision.requested", reason)
    for participant in [review.employee, review.manager]:
        notify(
            member.company,
            participant.membership.user,
            f"review:{review.id}:revision:{review.round}",
            "Review revision requested",
            f"/employee/reviews/{review.id}",
        )
    return review


@transaction.atomic
def finalise(member, review, version):
    review = lock(member, review, version)
    require_reviewer(member, review)
    if review.state != "ACKNOWLEDGEMENT_PENDING" or not review.employee_ack or not review.manager_ack:
        raise ValidationError("Both participants must acknowledge the shared record before HR finalisation.")
    sources = evidence_ready(review)
    forms = [
        {
            "kind": f.kind,
            "round": f.round,
            "content": f.content,
            "submitted_at": f.submitted_at.isoformat(),
            "author": str(f.author_id),
            "evidence_ids": [str(pk) for pk in f.evidence.values_list("id", flat=True)],
        }
        for f in current_forms(review)
    ]
    commitments = list(
        review.commitments.values(
            "id", "action", "owner_id", "manager_support", "success_measure", "due_date"
        )
    )
    content = {
        "company": {"id": str(review.company_id), "name": review.company.name},
        "employee": {
            "id": str(review.employee_id),
            "name": review.employee.membership.user.get_full_name(),
            "designation": review.employee.designation,
        },
        "manager": {"id": str(review.manager_id), "name": review.manager.membership.user.get_full_name()},
        "cycle": {
            "kind": review.cycle.kind,
            "year": review.cycle.year,
            "starts_on": review.cycle.starts_on,
            "ends_on": review.cycle.ends_on,
        },
        "forms": forms,
        "submission_history": [
            {
                "id": str(f.id),
                "kind": f.kind,
                "round": f.round,
                "content": f.content,
                "submitted_at": f.submitted_at,
                "author_id": str(f.author_id),
                "evidence_ids": [str(source.id) for source in f.evidence.all()],
            }
            for f in review.submissions.order_by("round", "kind").prefetch_related("evidence")
        ],
        "workflow_history": list(
            review.events.order_by("created_at").values(
                "action", "reason", "version", "actor_id", "created_at"
            )
        ),
        "ai_history": list(
            review.analyses.order_by("created_at").values(
                "id",
                "round",
                "input_hash",
                "input_snapshot",
                "prompt_version",
                "model",
                "state",
                "output",
                "decision",
                "decision_notes",
                "reviewed_at",
                "provider_response_id",
            )
        ),
        "hr_assessment": review.hr_assessment,
        "conversation": review.conversation,
        "midyear_comparison": review.comparison,
        "commitments": commitments,
        "evidence": list(
            sources.values(
                "id", "title", "sha256", "validation", "authorised_excerpt", "validated_by_id", "validated_at"
            )
        ),
        "employee_ack": review.employee_ack,
        "employee_comments": review.employee_comments,
        "manager_ack": review.manager_ack,
        "finalised_by": str(member.id),
        "finalised_at": timezone.now(),
    }
    content = json.loads(json.dumps(content, default=str))
    digest = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
    FinalSnapshot.objects.create(company=member.company, review=review, content=content, sha256=digest)
    review.state = "FINALISED"
    review.finalised_at = timezone.now()
    touch(member, review, "finalised")
    for participant in [review.employee, review.manager]:
        notify(
            member.company,
            participant.membership.user,
            f"review:{review.id}:finalised",
            "Your final review record is available",
            f"/employee/reviews/{review.id}",
        )
    return review
