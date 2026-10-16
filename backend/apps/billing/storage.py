"""Billing files fail closed if a bucket is missing or accidentally public."""

import requests
from django.conf import settings

from apps.evidence import storage as private_storage
from apps.evidence.storage import StorageUnavailable

BUCKETS = {"billing-invoices", "billing-payment-proofs"}


def require_private_bucket(bucket):
    if bucket not in BUCKETS:
        raise StorageUnavailable()
    # Reuse existing HTTPS/config validation; never log credentials or responses.
    private_storage.endpoint("validation", bucket=bucket)
    try:
        response = requests.get(
            f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/bucket/{bucket}",
            headers={"Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}"},
            timeout=(5, 15),
            allow_redirects=False,
        )
        if response.status_code != 200 or response.json().get("public") is not False:
            raise StorageUnavailable()
    except (requests.RequestException, ValueError, AttributeError):
        raise StorageUnavailable()


def put(key, content, mime, *, bucket, upsert=False):
    require_private_bucket(bucket)
    private_storage.put(key, content, mime, bucket=bucket, upsert=upsert)


def get(key, *, bucket):
    require_private_bucket(bucket)
    return private_storage.get(key, bucket=bucket)
