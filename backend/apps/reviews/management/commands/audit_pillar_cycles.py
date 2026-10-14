"""Read-only preflight, compatible with the schema before pillar migrations."""

from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import Count

from apps.organisation.models import GrowthEntry
from apps.reviews.models import Review, ReviewCycle, Submission


class Command(BaseCommand):
    help = "Report existing cycle/review/Growth data without modifying it or requiring pillar migrations."

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            columns = {
                c.name for c in connection.introspection.get_table_description(cursor, "reviews_reviewcycle")
            }
            tables = set(connection.introspection.table_names(cursor))
        fields = ["id", "company_id", "year", "kind", "launched_at"]
        if "workflow_version" in columns:
            fields += ["workflow_version", "started_at"]
        for cycle in ReviewCycle.objects.order_by("company_id", "year", "kind").values(*fields):
            self.stdout.write(str(cycle))
        self.stdout.write(
            "Review states: "
            + str(list(Review.objects.values("state").annotate(count=Count("id")).order_by("state")))
        )
        self.stdout.write(f"Submitted forms: {Submission.objects.filter(submitted_at__isnull=False).count()}")
        self.stdout.write(
            f"Growth records: {GrowthEntry.objects.count()}; private: {GrowthEntry.objects.filter(shared=False).count()}"
        )
        self.stdout.write(f"Legacy reporting table present: {'organisation_reportingrelationship' in tables}")
        self.stdout.write(
            "Existing cycles remain version 1; finish their existing reviews. New cycles default to version 2."
        )
        self.stdout.write(
            "No targets are fabricated. No submitted forms, final records, Growth records or audit rows are rewritten."
        )
