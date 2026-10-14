"""Opt-in tests on an isolated PostgreSQL server; never use DATABASE_URL here."""
import os

from .test import *  # noqa: F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "HOST": "127.0.0.1",
        "PORT": os.environ.get("BFL_TEST_POSTGRES_PORT", "55439"),
        "NAME": "postgres",
        "USER": os.environ.get("BFL_TEST_POSTGRES_USER", "postgres"),
        "PASSWORD": os.environ.get("BFL_TEST_POSTGRES_PASSWORD", ""),
        "TEST": {"NAME": "test_bfl_reporting"},
    }
}
