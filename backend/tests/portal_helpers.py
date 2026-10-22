from urllib.parse import urlsplit
from django.conf import settings


def bind_admin_portal(client):
    """Match the host binding normally established by credential login."""
    host = urlsplit(settings.ADMIN_FRONTEND_URL).hostname
    client.defaults["HTTP_HOST"] = host
    session = client.session
    session["portal_host"] = host
    session.save()
