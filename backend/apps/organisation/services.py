from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import record
from apps.companies.models import Company, Membership
from common.exceptions import Conflict
from common.permissions import require_hr

from .models import Department, EmployeeProfile, JobRole, ReportingRelationship


def related(model, company_id, pk):
    if not pk:
        return None
    obj = model.objects.filter(pk=pk, company_id=company_id).first()
    if not obj:
        raise ValidationError("Related object does not belong to this organisation.")
    return obj


@transaction.atomic
def create_employee(member, data):
    require_hr(member)
    department = related(Department, member.company_id, data.get("department"))
    role = related(JobRole, member.company_id, data.get("job_role"))
    User = get_user_model()
    email = data["email"].strip().lower()
    if User.objects.filter(email__iexact=email).exists():
        raise ValidationError(
            "An account already exists. Account linking requires verified invitation acceptance."
        )
    user = User(username=email, email=email, first_name=data["first_name"], last_name=data["last_name"])
    # Invitees cannot log in until a secure account activation flow is completed.
    user.set_unusable_password()
    user.save()
    membership = Membership.objects.create(
        company=member.company, user=user, is_manager=data.get("is_manager", False)
    )
    profile = EmployeeProfile.objects.create(
        company=member.company,
        membership=membership,
        department=department,
        job_role=role,
        designation=data.get("designation", ""),
        joined_on=data.get("joined_on"),
        senior_leader=data.get("senior_leader", False),
    )
    record(member, "employee.created", profile)
    return profile


@transaction.atomic
def set_manager(member, employee_id, manager_id, version):
    require_hr(member)
    # A tenant-wide row lock serialises competing hierarchy changes on PostgreSQL.
    Company.objects.select_for_update().get(pk=member.company_id)
    employee = related(EmployeeProfile, member.company_id, employee_id)
    if employee.version != version:
        raise Conflict()
    manager = related(EmployeeProfile, member.company_id, manager_id)
    if manager:
        if not manager.membership.is_manager or not manager.membership.active:
            raise ValidationError("The reporting manager must be an active manager.")
        cursor = manager
        seen = {employee.id}
        while cursor:
            if cursor.id in seen:
                raise ValidationError("Circular reporting and self-management are prohibited.")
            seen.add(cursor.id)
            link = ReportingRelationship.objects.select_related("manager").filter(employee=cursor).first()
            cursor = link.manager if link else None
        ReportingRelationship.objects.update_or_create(
            employee=employee, defaults={"company": member.company, "manager": manager}
        )
    else:
        ReportingRelationship.objects.filter(employee=employee).delete()
    employee.version += 1
    employee.save(update_fields=["version", "updated_at"])
    record(member, "hierarchy.changed", employee, manager_id=str(manager.id) if manager else None)
    return employee


def is_direct_report(member, employee):
    return ReportingRelationship.objects.filter(
        company_id=member.company_id, employee=employee, manager__membership=member
    ).exists()
