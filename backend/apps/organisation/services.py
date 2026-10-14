from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import record
from apps.companies.models import Membership
from common.permissions import require_hr

from .models import Department, EmployeeProfile, JobRole


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
    head_of_hr(member.company_id)
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
        company=member.company, user=user
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


def head_of_hr(company_id):
    heads = list(EmployeeProfile.objects.select_related("membership__user").filter(
        company_id=company_id, membership__company_id=company_id,
        membership__active=True, membership__is_head_hr=True,
        membership__user__is_superuser=False,
    )[:2])
    if len(heads) != 1:
        raise ValidationError("Company must have exactly one active Head of HR with an employee profile. Contact your administrator.")
    return heads[0]


def effective_manager(employee):
    head = head_of_hr(employee.company_id)
    return None if employee.membership_id == head.membership_id else head


def is_direct_report(member, employee):
    return bool(
        member.active and member.is_head_hr
        and employee.company_id == member.company_id
        and employee.membership.company_id == member.company_id
        and employee.membership.active and employee.membership_id != member.id
    )
