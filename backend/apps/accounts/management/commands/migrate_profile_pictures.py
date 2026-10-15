"""Explicit, retryable transfer of legacy database avatars to private storage."""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.evidence import storage
from apps.organisation.models import EmployeeProfile


class Command(BaseCommand):
    help = "Move legacy PNG avatars to profile-pictures. Create the private bucket first."

    def handle(self, *args, **options):
        count = 0
        ids = EmployeeProfile.objects.filter(avatar_data__isnull=False).values_list(
            "membership__user_id", flat=True
        ).distinct()
        for user_id in list(ids):
            with transaction.atomic():
                user = get_user_model().objects.select_for_update().get(pk=user_id)
                profiles = EmployeeProfile.objects.filter(membership__user=user)
                # Most recently changed membership wins if old avatars differ.
                legacy = profiles.filter(avatar_data__isnull=False).order_by("-updated_at", "id").first()
                if not legacy:
                    continue
                if not user.profile_picture_storage_path:
                    key = f"users/{user.id}/avatar.png"
                    storage.put(key, bytes(legacy.avatar_data), "image/png", bucket="profile-pictures", upsert=True)
                    user.profile_picture_storage_path = key
                    user.profile_picture_version += 1
                    user.save(update_fields=["profile_picture_storage_path", "profile_picture_version"])
                profiles.update(avatar_data=None, photo_url="")
                count += 1
        self.stdout.write(self.style.SUCCESS(f"Migrated {count} user(s)."))
