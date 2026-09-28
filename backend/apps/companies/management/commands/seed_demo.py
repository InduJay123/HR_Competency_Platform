import os
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.companies.models import Company, Membership
from apps.organisation.models import Department, EmployeeProfile, JobRole
from apps.organisation.services import set_manager
from apps.tasks.services import assign_work


class Command(BaseCommand):
    help = "Explicit, idempotent development seed. Never runs in production."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Demo seed is disabled outside development.")
        password = os.environ.get("BFL_DEMO_PASSWORD")
        if not password or len(password) < 12:
            raise CommandError("Set BFL_DEMO_PASSWORD (12+ characters) in the server environment.")
        company, created = Company.objects.get_or_create(
            slug="atlas-demo", defaults={"name": "Atlas Holdings", "tagline": "Creating value that lasts"}
        )
        if not created:
            self.stdout.write("Atlas demo already exists; preserved without resetting passwords or data.")
            return
        department = Department.objects.create(company=company, name="Operations")
        people = {}
        for name, last, title, manager, hr in [
            ("kavindi", "Fernando", "Head of HR", False, True),
            ("sarah", "Fernando", "Head of Operations", True, False),
            ("nimal", "Perera", "Operations Manager", True, False),
            ("kamal", "Silva", "Assistant Manager", False, False),
        ]:
            email = f"{name}@atlas.example"
            user = get_user_model().objects.create_user(
                username=email, email=email, first_name=name.title(), last_name=last, password=password
            )
            member = Membership.objects.create(
                company=company, user=user, is_manager=manager, is_hr=hr, is_head_hr=hr
            )
            role = JobRole.objects.create(company=company, name=title)
            EmployeeProfile.objects.create(
                company=company,
                membership=member,
                department=department,
                job_role=role,
                designation=title,
                joined_on=date(2012, 1, 1),
                senior_leader=name == "sarah",
            )
            people[name] = member
        set_manager(people["kavindi"], people["nimal"].profile.id, people["sarah"].profile.id, 1)
        set_manager(people["kavindi"], people["kamal"].profile.id, people["nimal"].profile.id, 1)
        assign_work(
            people["sarah"],
            {
                "title": "Customer handover playbook",
                "expected_outcome": "Every client has an agreed handover owner and a complete checklist.",
                "assigned_to": people["nimal"].profile.id,
                "due_date": date.today() + timedelta(days=14),
                "priority": "HIGH",
            },
        )
        self.stdout.write("Seeded Atlas development data. Password is not displayed.")
