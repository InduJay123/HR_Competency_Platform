from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.companies.models import Membership, PlatformEvent


class Command(BaseCommand):
    help = "Promote an existing account to platform admin and retire tenant memberships without deleting history."

    def add_arguments(self, parser):
        parser.add_argument("email")

    @transaction.atomic
    def handle(self, *args, **options):
        user = get_user_model().objects.filter(email__iexact=options["email"]).first()
        if not user:
            raise CommandError("No account found.")
        from django.db.models import Q

        from apps.organisation.models import ReportingRelationship
        from apps.reviews.models import Review

        members = Membership.objects.filter(user=user)
        if ReportingRelationship.objects.filter(
            Q(employee__membership__in=members) | Q(manager__membership__in=members)
        ).exists():
            raise CommandError("Reassign reporting relationships before promotion.")
        if (
            Review.objects.exclude(state="FINALISED")
            .filter(
                Q(employee__membership__in=members)
                | Q(manager__membership__in=members)
                | Q(reviewer__in=members)
            )
            .exists()
        ):
            raise CommandError("Reassign unfinished reviews before promotion.")
        user.is_superuser = True
        user.is_staff = True
        user.save(update_fields=["is_superuser", "is_staff"])
        members.update(active=False, is_hr=False, is_head_hr=False, is_manager=False)
        PlatformEvent.objects.create(actor=user, action="platform.administrator_promoted")
        self.stdout.write("Platform administrator enabled; company memberships retired.")
