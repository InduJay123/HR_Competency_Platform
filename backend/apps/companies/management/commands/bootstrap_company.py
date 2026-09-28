from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.companies.models import Company, Membership
from apps.organisation.models import EmployeeProfile


class Command(BaseCommand):
    help = (
        "Create a tenant and independent Head of HR account. Access is activated through a secure invitation."
    )

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True)
        parser.add_argument("--slug", required=True)
        parser.add_argument("--email", required=True)
        parser.add_argument("--first-name", required=True)
        parser.add_argument("--last-name", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        email = options["email"].lower()
        if (
            Company.objects.filter(slug=options["slug"]).exists()
            or User.objects.filter(email__iexact=email).exists()
        ):
            raise CommandError("Company or user already exists; no permissions were changed.")
        company = Company.objects.create(name=options["name"], slug=options["slug"])
        user = User(
            username=email, email=email, first_name=options["first_name"], last_name=options["last_name"]
        )
        user.set_unusable_password()
        user.save()
        member = Membership.objects.create(company=company, user=user, is_hr=True, is_head_hr=True)
        EmployeeProfile.objects.create(company=company, membership=member, designation="Head of HR")
        self.stdout.write(
            "Company and Head of HR created. Configure email, then use the password access flow to activate the account."
        )
