"""Private storage only. Never returns a public object URL or fetches user links."""

from pathlib import Path
from urllib.parse import quote

import requests
from django.conf import settings
from rest_framework.exceptions import APIException


class StorageUnavailable(APIException):
    status_code = 503
    default_detail = "Private file storage is unavailable. Please try again later."


def local_path(key):
    root = Path(settings.PRIVATE_MEDIA_ROOT).resolve()
    path = (root / key).resolve()
    if not path.is_relative_to(root):
        raise StorageUnavailable()
    return path


def endpoint(key):
    base = settings.SUPABASE_URL.rstrip("/")
    if not base.startswith("https://") or not settings.SUPABASE_SERVICE_KEY:
        raise StorageUnavailable()
    return f"{base}/storage/v1/object/{quote(settings.SUPABASE_STORAGE_BUCKET)}/{quote(key)}"


def put(key, content, mime):
    if settings.PRIVATE_STORAGE_BACKEND == "local" and settings.DEBUG:
        path = local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as stream:
            stream.write(content)
        return
    try:
        response = requests.post(
            endpoint(key),
            data=content,
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "Content-Type": mime,
                "x-upsert": "false",
            },
            timeout=(5, 30),
            allow_redirects=False,
        )
        if response.status_code not in (200, 201):
            raise StorageUnavailable()
    except requests.RequestException:
        raise StorageUnavailable()


def get(key):
    if settings.PRIVATE_STORAGE_BACKEND == "local" and settings.DEBUG:
        try:
            return local_path(key).read_bytes()
        except OSError:
            raise StorageUnavailable()
    try:
        response = requests.get(
            endpoint(key),
            headers={"Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}"},
            timeout=(5, 30),
            allow_redirects=False,
        )
        if response.status_code != 200:
            raise StorageUnavailable()
        return response.content
    except requests.RequestException:
        raise StorageUnavailable()
