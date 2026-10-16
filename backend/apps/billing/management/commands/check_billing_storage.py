from django.core.management.base import BaseCommand, CommandError

from apps.billing.storage import BUCKETS, require_private_bucket
from apps.evidence.storage import StorageUnavailable


class Command(BaseCommand):
    help = "Verify private billing buckets using metadata only; never uploads or changes objects."

    def handle(self, *args, **options):
        failed = []
        for bucket in sorted(BUCKETS):
            try:
                require_private_bucket(bucket)
                self.stdout.write(f"{bucket}: private and accessible")
            except StorageUnavailable:
                failed.append(bucket)
                self.stderr.write(f"{bucket}: unavailable, missing, or not private")
        if failed:
            raise CommandError("Verify the named private buckets and backend Supabase configuration.")
