from .models import AuditLog


def record(member, action, obj, **metadata):
    return AuditLog.objects.create(
        company_id=member.company_id,
        actor=member.user,
        action=action,
        object_id=str(obj.pk),
        metadata=metadata,
    )
