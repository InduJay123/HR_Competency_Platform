from celery import shared_task
from django.utils import timezone

from apps.development.models import Commitment
from apps.reviews.models import Review

from .services import notify


@shared_task
def send_due_reminders():
    today = timezone.localdate()
    for r in (
        Review.objects.filter(cycle__due_on__lte=today)
        .exclude(state="FINALISED")
        .select_related(
            "company", "employee__membership__user", "manager__membership__user", "reviewer__user"
        )
    ):
        for person in [r.employee.membership, r.manager.membership, r.reviewer]:
            if person.active and person.profile.notification_digest:
                notify(
                    r.company,
                    person.user,
                    f"review:{r.id}:due:{today}",
                    "Review action is due",
                    f"/employee/reviews/{r.id}",
                )
    for c in (
        Commitment.objects.filter(due_date__lte=today, review__state="FINALISED")
        .exclude(status="COMPLETE")
        .select_related("company", "owner__membership__user")
    ):
        if c.owner.membership.active and c.owner.notification_digest:
            notify(
                c.company,
                c.owner.membership.user,
                f"development:{c.id}:due:{today}",
                "Development commitment is due",
                "/employee/development",
            )
