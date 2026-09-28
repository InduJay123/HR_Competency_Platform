from django.db import models

from common.models import TenantEntity


class Analysis(TenantEntity):
    review = models.ForeignKey("reviews.Review", on_delete=models.PROTECT, related_name="analyses")
    requested_by = models.ForeignKey("companies.Membership", on_delete=models.PROTECT)
    round = models.PositiveIntegerField()
    input_hash = models.CharField(max_length=64)
    input_snapshot = models.JSONField()
    prompt_version = models.CharField(max_length=40, default="stewardship-coach-v1")
    model = models.CharField(max_length=100)
    state = models.CharField(max_length=20, default="QUEUED")
    attempts = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(null=True)
    output = models.JSONField(default=dict)
    provider_response_id = models.CharField(max_length=200, blank=True)
    error_code = models.CharField(max_length=60, blank=True)
    decision = models.CharField(max_length=12, blank=True)
    decision_notes = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["review", "round", "input_hash"], name="analysis_input_unique")
        ]


class TrainerConversation(TenantEntity):
    owner = models.ForeignKey("companies.Membership", on_delete=models.PROTECT)
    title = models.CharField(max_length=120, default="Learning conversation")
    busy = models.BooleanField(default=False)


class TrainerMessage(models.Model):
    conversation = models.ForeignKey(TrainerConversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=12, choices=[("user", "User"), ("assistant", "Assistant")])
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
