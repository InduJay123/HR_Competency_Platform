import json

from django.db import migrations


def archive_growth_evidence(apps, schema_editor):
    Review = apps.get_model("reviews", "Review")
    Event = apps.get_model("reviews", "ReviewEvent")
    alias = schema_editor.connection.alias
    for review in Review.objects.using(alias).exclude(state="FINALISED").iterator():
        context = review.pillar_context
        if not isinstance(context, list) or any(not isinstance(p, dict) for p in context):
            raise RuntimeError(f"Invalid pillar context in review {review.pk}; resolve before retrying migration.")
        if not any("evidence" in pillar for pillar in context):
            continue
        version = review.version + 1
        Event.objects.using(alias).create(
            company_id=review.company_id, review_id=review.id, actor_id=review.reviewer_id,
            action="growth_evidence.archived", version=version,
            reason=json.dumps({"pillar_context": context, "reason": "Growth Tools are independent of formal reviews."}),
        )
        Review.objects.using(alias).filter(pk=review.pk).update(
            pillar_context=[{k: v for k, v in pillar.items() if k != "evidence"} for pillar in context],
            version=version,
        )


class Migration(migrations.Migration):
    dependencies = [("reviews", "0006_review_pillar_context_reviewcycle_started_at_and_more")]
    operations = [migrations.RunPython(archive_growth_evidence)]
