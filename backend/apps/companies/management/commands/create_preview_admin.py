"""Create an explicitly requested local preview identity, never a production account."""

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.companies.models import Company, Membership
from apps.organisation.models import EmployeeProfile


class Command(BaseCommand):
    help = "Create a local-only preview administrator with a password supplied through the environment."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--first-name", required=True)
        parser.add_argument("--last-name", required=True)
        parser.add_argument("--company", default="atlas-demo")

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Preview administrators are disabled outside development.")
        password = os.environ.get("BFL_PREVIEW_PASSWORD", "")
        if len(password) < 8:
            raise CommandError("Set BFL_PREVIEW_PASSWORD with at least eight characters.")
        company = Company.objects.get(slug=options["company"], active=True)
        email = options["email"].strip().lower()
        if get_user_model().objects.filter(email__iexact=email).exists():
            raise CommandError("This identity already exists; no credentials or roles were changed.")
        user = get_user_model().objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=options["first_name"],
            last_name=options["last_name"],
        )
        member = Membership.objects.create(
            company=company,
            user=user,
            is_hr=True,
            is_head_hr=True,
            is_manager=True,
        )
        EmployeeProfile.objects.create(
            company=company,
            membership=member,
            designation="Preview Administrator",
        )
        self.stdout.write(
            f"Created local preview administrator: {user.get_full_name()} ({email}). No email sent."
        )
