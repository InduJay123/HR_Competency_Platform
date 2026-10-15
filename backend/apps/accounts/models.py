import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    profile_picture_storage_path = models.CharField(max_length=255, blank=True, default="", editable=False)
    profile_picture_version = models.PositiveIntegerField(default=0, editable=False)

    @property
    def profile_picture_url(self):
        if not self.profile_picture_storage_path:
            return ""
        return f"/api/v1/auth/profile/photo/?v={self.profile_picture_version}"
