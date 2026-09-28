from .models import Notification


def notify(company, user, event_key, title, path):
    return Notification.objects.get_or_create(
        company=company, recipient=user, event_key=event_key, defaults={"title": title, "path": path}
    )[0]
