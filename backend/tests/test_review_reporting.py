from copy import deepcopy
from datetime import date

from django.test import TestCase
from django.utils import timezone

from apps.reviews.models import FinalSnapshot, Review, ReviewCycle, Submission
from tests.test_foundation import FoundationTests
from tests.test_reviews import ReviewTests


class ReviewReportingTests(TestCase):
    person = FoundationTests.person
    acting = FoundationTests.acting
    content = ReviewTests.content
    launch = ReviewTests.launch

    def setUp(self):
        FoundationTests.setUp(self)
        self.cycle = ReviewCycle.objects.create(workflow_version=1, company=self.company, year=2026, kind='MID_YEAR',
            starts_on=date(2026, 1, 1), ends_on=date(2026, 6, 30), due_on=date(2026, 7, 15))

    def test_preview_and_launch_resolve_head_hr(self):
        response = self.acting(self.hr).get(f'/api/v1/review-cycles/{self.cycle.id}/preview/')
        self.assertEqual(response.status_code, 200)
        people = {str(p['id']): p['has_manager'] for p in response.data['people']}
        self.assertFalse(people[str(self.hr.profile.id)])
        self.assertTrue(people[str(self.nimal.profile.id)])
        self.assertEqual(self.launch().manager, self.hr.profile)

    def test_head_cannot_launch_their_own_review(self):
        response = self.acting(self.hr).post(f'/api/v1/review-cycles/{self.cycle.id}/launch/',
            {'employee_ids': [str(self.hr.profile.id)], 'reviewer_id': str(self.hr.id)}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Review.objects.exists())

    def test_existing_open_review_routes_to_head_and_preserves_sealed_appraisal(self):
        review = self.launch()
        review.manager = self.sarah.profile
        review.save()
        form = Submission.objects.create(company=self.company, review=review, kind='MANAGER', round=1,
            author=self.sarah, content=self.content('MANAGER'), submitted_at=timezone.now())
        before = deepcopy(Submission.objects.values().get(pk=form.pk))
        response = self.acting(self.hr).get(f'/api/v1/reviews/{review.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(str(response.data['manager_member']), str(self.hr.id))
        self.assertEqual(self.acting(self.hr).get(f'/api/v1/reviews/?manager={self.hr.profile.id}').data['count'], 1)
        result = self.acting(self.sarah).post(f'/api/v1/reviews/{review.id}/manager-assessment/',
            {'version': review.version, 'content': {}, 'submit': False}, format='json')
        self.assertEqual(result.status_code, 403)
        result = self.acting(self.hr).post(f'/api/v1/reviews/{review.id}/manager-assessment/',
            {'version': review.version, 'content': {}, 'submit': False}, format='json')
        self.assertEqual(result.status_code, 400)
        self.assertEqual(Submission.objects.values().get(pk=form.pk), before)
        review.refresh_from_db()
        self.assertEqual(review.manager_id, self.sarah.profile.id)

    def test_legacy_draft_is_archived_before_current_head_takes_authorship(self):
        review = self.launch()
        review.manager = self.sarah.profile
        review.save()
        form = Submission.objects.create(company=self.company, review=review, kind='MANAGER', round=1,
            author=self.sarah, content={'summary': 'Original draft'})
        response = self.acting(self.hr).post(f'/api/v1/reviews/{review.id}/manager-assessment/',
            {'version': review.version, 'content': {'summary': 'Head draft'}, 'submit': False}, format='json')
        self.assertEqual(response.status_code, 200)
        form.refresh_from_db()
        self.assertEqual(form.author, self.hr)
        event = review.events.get(action='manager.draft_transferred')
        self.assertIn('Original draft', event.reason)
        self.assertIn(str(self.sarah.id), event.reason)

    def test_completed_review_keeps_original_manager_and_snapshot(self):
        review = self.launch()
        review.manager = self.sarah.profile
        review.state = 'FINALISED'
        review.save()
        FinalSnapshot.objects.create(company=self.company, review=review, content={'historical': True}, sha256='f'*64)
        before = deepcopy(Review.objects.values().get(pk=review.pk))
        for actor in (self.hr, self.nimal, self.sarah):
            response = self.acting(actor).get(f'/api/v1/reviews/{review.id}/')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(str(response.data['manager_member']), str(self.sarah.id))
        self.assertEqual(Review.objects.values().get(pk=review.pk), before)
        self.assertEqual(review.snapshot.content, {'historical': True})

    def test_head_can_assign_followup_from_a_historical_managers_review(self):
        from apps.development.models import Commitment

        review = self.launch()
        review.manager = self.sarah.profile
        review.state = 'FINALISED'
        review.save()
        item = Commitment.objects.create(company=self.company, review=review,
            employee=self.nimal.profile, owner=self.nimal.profile, action='Develop capability',
            manager_support='Provide practice', success_measure='Agreed progress', due_date=date(2026,12,1))
        response = self.acting(self.hr).post(f'/api/v1/development/{item.id}/create-work/', {}, format='json')
        self.assertEqual(response.status_code, 201)
        review.refresh_from_db()
        self.assertEqual(review.manager_id, self.sarah.profile.id)
