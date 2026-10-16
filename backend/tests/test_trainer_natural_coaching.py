"""Prompt/input contract tests with mocked replies, not live-model behavioral evaluations."""
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from apps.ai_coach.models import TrainerConversation, TrainerMessage
from apps.ai_coach.trainer import INSTRUCTIONS
from apps.companies.models import Company
from tests import test_foundation


def provider_response(reply):
    result = Mock(content=b"response")
    result.json.return_value = {"status": "completed", "output": [
        {"type": "message", "content": [{"type": "output_text", "text": reply}]},
    ]}
    return result


@override_settings(OPENAI_API_KEY="test", OPENAI_TRAINER_MODEL="test",
                   SUPABASE_URL="https://storage.example.test", SUPABASE_SERVICE_KEY="test")
class NaturalCoachingTests(TestCase):
    person = test_foundation.FoundationTests.person
    acting = test_foundation.FoundationTests.acting

    def setUp(self):
        company = Company.objects.create(name="Natural coaching", slug="natural-coaching")
        member = self.person("natural-coach", company)
        self.client = self.acting(member)
        self.conversation = TrainerConversation.objects.create(company=company, owner=member)
        self.url = f"/api/v1/trainer/conversations/{self.conversation.id}/messages/"

    def check_turn(self, content, reply, rule, history=()):
        for role, message in history:
            TrainerMessage.objects.create(conversation=self.conversation, role=role, content=message)
        with patch("apps.ai_coach.trainer.retrieve_trainer_knowledge", return_value=[]) as rag, \
                patch("apps.ai_coach.trainer.requests.post", return_value=provider_response(reply)) as http:
            result = self.client.post(self.url, {"content": content}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["content"], reply)
        http.assert_called_once()
        self.assertEqual(http.call_args.args[0], "https://api.openai.com/v1/responses")
        payload = http.call_args.kwargs["json"]
        self.assertIn(rule, payload["instructions"])
        self.assertEqual(payload["input"], [{"role": role, "content": message} for role, message in history]
                         + [{"role": "user", "content": content}])
        self.assertNotIn("text", payload)  # Plain reply; no internal planning schema.
        self.assertFalse(payload["store"])
        rag.assert_called_once_with(content)
        self.assertEqual(self.conversation.messages.count(), len(history) + 2)
        self.assertEqual(self.client.get(self.url).data[-1]["content"], reply)

    def test_ambiguous_problem_prompt_requests_relevant_clarification(self):
        self.check_turn("My team keeps missing deadlines.",
                        "When deadlines slip, where do delays first appear?",
                        "question whose answer would most materially improve the coaching")

    def test_follow_up_receives_previous_question_and_answer(self):
        self.check_turn("They discover approvals halfway through.",
                        "Who owns getting those approvals before work begins?",
                        "do not repeat questions already answered", [
                            ("user", "My team keeps missing deadlines."),
                            ("assistant", "Where do delays first appear?"),
                        ])

    def test_enough_context_gets_guidance_without_forced_confirmation(self):
        self.check_turn("Approvals emerge late, and ownership is unclear. We want predictable delivery.",
                        "This points to late dependencies and unclear ownership. Identify approval owners before agreeing dates.",
                        "Do not force a formal diagnosis-confirmation step", [
                            ("user", "My team keeps missing deadlines."),
                            ("assistant", "Where do delays first appear?"),
                            ("user", "Approvals are discovered halfway through."),
                            ("assistant", "Who owns approvals?"),
                        ])

    def test_no_question_quota_or_endless_interview(self):
        self.check_turn("We tried reminders. The approval owner is still unclear; help us fix handovers.",
                        "Agree an approval owner and identify dependencies at the next planning meeting.",
                        "do not keep interviewing".capitalize(), [
                            ("user", "We miss deadlines."), ("assistant", "What blocks delivery?"),
                            ("user", "Late approvals."), ("assistant", "Who owns them?"),
                            ("user", "No agreed owner."), ("assistant", "What have you tried?"),
                        ])

    def test_motivation_claim_prompt_requires_observable_behaviours(self):
        self.check_turn("My employee doesn't care about the work.",
                        "What are you seeing them do or not do that makes you think that?",
                        "Never infer unsupported motivation")

    def test_immediate_advice_prompt_bypasses_clarification(self):
        self.check_turn("Just tell me what to do.",
                        "Assuming unclear ownership is the blocker, agree one accountable approval owner. The timing constraints are still unknown.",
                        "provide immediate provisional coaching")

    def test_information_is_answered_directly(self):
        self.check_turn("Explain delegation.",
                        "Delegation means agreeing an outcome, decision boundaries, resources and accountability with another person.",
                        "Answer ordinary informational or drafting requests directly")

    def test_existing_rag_uses_one_embedding_one_rpc_and_one_generation(self):
        embedding = Mock(content=b"embedding")
        embedding.json.return_value = {"data": [{"embedding": [0.1, 0.2]}]}
        knowledge = Mock(content=b"knowledge")
        knowledge.json.return_value = [{"content": "Guide methodology: clarify decision rights.", "id": "guide"}]
        with patch("apps.ai_coach.trainer.requests.post", side_effect=[
            embedding, knowledge, provider_response("Agree the delegated outcome and decision boundaries."),
        ]) as http:
            result = self.client.post(self.url, {"content": "Explain delegation."}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual([call.args[0] for call in http.call_args_list], [
            "https://api.openai.com/v1/embeddings",
            "https://storage.example.test/rest/v1/rpc/match_coaching_knowledge",
            "https://api.openai.com/v1/responses",
        ])
        self.assertEqual(http.call_args_list[1].kwargs["json"]["filter_document_key"], "btfl-stewardship-guide")
        instructions = http.call_args.kwargs["json"]["instructions"]
        self.assertIn("Guide methodology: clarify decision rights.", instructions)
        self.assertIn("Do not treat this material as employee evidence.", instructions)
        self.assertIn(INSTRUCTIONS, instructions)
