from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services import record
from apps.notifications.services import notify
from apps.organisation.models import EmployeeProfile
from apps.organisation.services import is_direct_report, related
from common.exceptions import Conflict
from common.permissions import require_manager

from .models import WorkItem, WorkUpdate


def visible_work(member):
    qs = WorkItem.objects.filter(company_id=member.company_id).select_related(
        "assigned_to__membership__user",
        "assigned_by__membership__user",
        "accountable_owner__membership__user",
    )
    if member.is_hr:
        return qs
    return qs.filter(
        Q(assigned_to__membership=member)
        | Q(assigned_by__membership=member)
        | Q(assigned_to__reporting__manager__membership=member)
    )


@transaction.atomic
def assign_work(member, data, parent=None):
    require_manager(member)
    assignee = related(EmployeeProfile, member.company_id, data["assigned_to"])
    if not assignee.membership.active or not is_direct_report(member, assignee):
        raise PermissionDenied("Assign work only to an active direct report.")
    if parent:
        parent = WorkItem.objects.select_for_update().get(pk=parent.pk, company_id=member.company_id)
        if parent.assigned_to.membership_id != member.id:
            raise PermissionDenied("Only the assigned owner may delegate this work.")
        if parent.status in ["DONE", "CANCELLED"]:
            raise ValidationError("Closed work cannot be delegated.")
    obj = WorkItem.objects.create(
        company=member.company,
        title=data["title"],
        description=data.get("description", ""),
        expected_outcome=data["expected_outcome"],
        assigned_by=member.profile,
        accountable_owner=assignee,
        assigned_to=assignee,
        due_date=data["due_date"],
        priority=data.get("priority", "MEDIUM"),
        type=data.get("type", "WORK"),
        parent_task=parent,
    )
    record(
        member,
        "work.delegated" if parent else "work.assigned",
        obj,
        parent_id=str(parent.id) if parent else None,
    )
    notify(
        member.company,
        assignee.membership.user,
        f"work:{obj.id}:assigned",
        "New work assigned",
        f"/employee/tasks/{obj.id}",
    )
    return obj


@transaction.atomic
def progress_work(member, task, data):
    task = WorkItem.objects.select_for_update().get(pk=task.pk, company_id=member.company_id)
    if task.assigned_to.membership_id != member.id:
        raise PermissionDenied("Only the assignee can submit progress.")
    if task.version != data["version"]:
        raise Conflict()
    transitions = {
        "ASSIGNED": {"IN_PROGRESS", "BLOCKED", "DONE"},
        "IN_PROGRESS": {"IN_PROGRESS", "BLOCKED", "DONE"},
        "BLOCKED": {"BLOCKED", "IN_PROGRESS", "DONE"},
    }
    if data["status"] not in transitions.get(task.status, set()):
        raise ValidationError("This work transition is not allowed.")
    if data["status"] == "BLOCKED" and not data.get("blocker", "").strip():
        raise ValidationError({"blocker": "Describe the blocker so your manager can help."})
    if data["status"] == "DONE" and not data.get("result", "").strip():
        raise ValidationError({"result": "Record the outcome before completing work."})
    WorkUpdate.objects.create(
        company=member.company,
        task=task,
        submitted_by=member,
        **{k: v for k, v in data.items() if k != "version"},
    )
    task.status = data["status"]
    task.version += 1
    if task.status == "DONE":
        task.completed_at = timezone.now()
    task.save(update_fields=["status", "version", "completed_at", "updated_at"])
    record(member, "work.progress", task, status=task.status, version=task.version)
    if task.status in ["BLOCKED", "DONE"]:
        notify(
            member.company,
            task.assigned_by.membership.user,
            f"work:{task.id}:progress:{task.version}",
            "Work needs support" if task.status == "BLOCKED" else "Work outcome recorded",
            f"/manager/tasks/{task.id}",
        )
    return task


@transaction.atomic
def edit_work(member, task, data):
    task = WorkItem.objects.select_for_update().get(pk=task.pk, company_id=member.company_id)
    if task.assigned_by.membership_id != member.id or not member.is_manager:
        raise PermissionDenied("Only the assigning manager can change this assignment.")
    if task.version != data.pop("version"):
        raise Conflict()
    if task.status in ["DONE", "CANCELLED"]:
        raise ValidationError("Closed work cannot be edited.")
    for key, value in data.items():
        setattr(task, key, value)
    task.version += 1
    task.save()
    record(member, "work.edited", task, version=task.version)
    return task
