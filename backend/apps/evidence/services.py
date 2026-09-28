import hashlib
import uuid

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services import record
from apps.reviews.models import Submission

from . import storage
from .models import EvidenceItem


@transaction.atomic
def add_evidence(member, task, data, file=None):
    if task.assigned_to.membership_id != member.id:
        raise PermissionDenied("Only the work owner can attach evidence.")
    values = {"company": member.company, "task": task, "uploaded_by": member, **data}
    if file:
        content = file.read(5 * 1024 * 1024 + 1)
        if len(content) > 5 * 1024 * 1024:
            raise ValidationError("Maximum upload size is 5 MB.")
        mime = (
            "application/pdf"
            if content.startswith(b"%PDF-")
            else "image/png"
            if content.startswith(b"\x89PNG\r\n\x1a\n")
            else "image/jpeg"
            if content.startswith(b"\xff\xd8\xff")
            else None
        )
        if not mime:
            raise ValidationError("Upload a PDF, PNG or JPEG file.")
        key = f"{member.company_id}/{uuid.uuid4()}"
        storage.put(key, content, mime)
        values.update(
            kind="FILE",
            storage_key=key,
            mime_type=mime,
            sha256=hashlib.sha256(content).hexdigest(),
            size=len(content),
        )
    elif data["kind"] == "FILE":
        raise ValidationError("A file is required.")
    elif data["kind"] == "NOTE" and not data.get("note", "").strip():
        raise ValidationError("Write the supporting evidence.")
    elif data["kind"] == "LINK" and not data.get("link", "").startswith("https://"):
        raise ValidationError("Use an HTTPS reference. The platform does not fetch the link.")
    obj = EvidenceItem.objects.create(**values)
    record(member, "evidence.added", obj, kind=obj.kind)
    return obj


@transaction.atomic
def validate_evidence(member, obj, data):
    if not member.is_head_hr or obj.task.assigned_to.membership_id == member.id:
        raise PermissionDenied("An independent appointed Head of HR must validate evidence.")
    if not Submission.objects.filter(
        company=member.company,
        review__reviewer=member,
        review__employee=obj.task.assigned_to,
        review__state__in=["PREPARING", "SUBMITTED", "CONVERSATION_READY", "REVISION_REQUESTED"],
        round=F("review__round"),
        submitted_at__isnull=False,
        evidence=obj,
    ).exists():
        raise PermissionDenied(
            "Only the appointed reviewer may validate sources selected in a current submitted form."
        )
    obj = EvidenceItem.objects.select_for_update().get(id=obj.id, company=member.company)
    if obj.validation != "PENDING":
        raise ValidationError(
            "Evidence validation is already recorded. Add a new evidence version to revise it."
        )
    obj.validation = data["validation"]
    obj.authorised_excerpt = data.get("authorised_excerpt", "")
    obj.validation_reason = data["validation_reason"]
    if obj.validation == "VALIDATED" and not obj.authorised_excerpt.strip():
        raise ValidationError("Provide the authorised excerpt for analysis.")
    obj.validated_by = member
    obj.validated_at = timezone.now()
    obj.save()
    record(member, "evidence.validated", obj, status=obj.validation)
    return obj
