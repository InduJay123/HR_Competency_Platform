import tempfile
from datetime import date

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.reviews.models import Review, ReviewCycle, Submission

from . import test_foundation as fixture


class EvidenceTests(TestCase):
    person = fixture.FoundationTests.person
    acting = fixture.FoundationTests.acting
    task_data = fixture.FoundationTests.task_data
    task = fixture.FoundationTests.task

    def setUp(self):
        fixture.FoundationTests.setUp(self)
        self.work = self.task()
        self.tmp = tempfile.TemporaryDirectory(
            dir=str(__import__("pathlib").Path(__file__).resolve().parents[2] / "tmp")
        )
        self.addCleanup(self.tmp.cleanup)
        self.override = override_settings(
            PRIVATE_STORAGE_BACKEND="local", PRIVATE_MEDIA_ROOT=self.tmp.name, DEBUG=True
        )
        self.override.enable()
        self.addCleanup(self.override.disable)

    def upload(self):
        return self.acting(self.nimal).post(
            "/api/v1/evidence/",
            {
                "task": str(self.work.id),
                "title": "Handover proof",
                "kind": "FILE",
                "file": SimpleUploadedFile("proof.pdf", b"%PDF-1.4\nTest evidence"),
            },
            format="multipart",
        )

    def test_private_upload_and_download(self):
        r = self.upload()
        self.assertEqual(r.status_code, 201)
        self.assertNotIn("storage_key", r.data)
        result = self.acting(self.nimal).get(f"/api/v1/evidence/{r.data['id']}/download/")
        self.assertEqual(result.status_code, 200)
        self.assertIn("attachment", result["Content-Disposition"])
        self.assertTrue(AuditLog.objects.filter(action="evidence.downloaded").exists())

    def test_cross_tenant_download_hidden(self):
        r = self.upload()
        self.assertEqual(
            self.acting(self.foreign).get(f"/api/v1/evidence/{r.data['id']}/download/").status_code, 404
        )

    def test_unauthorised_upload_denied(self):
        r = self.acting(self.kamal).post(
            "/api/v1/evidence/",
            {"task": str(self.work.id), "title": "Proof", "kind": "NOTE", "note": "Not my work"},
            format="json",
        )
        self.assertEqual(r.status_code, 404)

    def test_fake_file_extension_rejected(self):
        r = self.acting(self.nimal).post(
            "/api/v1/evidence/",
            {
                "task": str(self.work.id),
                "title": "Proof",
                "kind": "FILE",
                "file": SimpleUploadedFile("fake.pdf", b"<script>unsafe</script>"),
            },
            format="multipart",
        )
        self.assertEqual(r.status_code, 400)

    def test_only_hr_validates_and_validation_is_locked(self):
        r = self.upload()
        url = f"/api/v1/evidence/{r.data['id']}/validate/"
        body = {
            "validation": "VALIDATED",
            "authorised_excerpt": "Handover checklist completed.",
            "validation_reason": "Checked the source.",
        }
        self.assertEqual(self.acting(self.sarah).post(url, body, format="json").status_code, 403)
        # A Head of HR role alone does not authorise access to the validation action.
        self.assertEqual(self.acting(self.hr).post(url, body, format="json").status_code, 403)
        cycle = ReviewCycle.objects.create(
            company=self.company,
            year=2026,
            kind="MID_YEAR",
            starts_on=date(2026, 1, 1),
            ends_on=date(2026, 6, 30),
            due_on=date(2026, 7, 15),
        )
        review = Review.objects.create(
            company=self.company,
            cycle=cycle,
            employee=self.nimal.profile,
            manager=self.sarah.profile,
            reviewer=self.hr,
            state="PREPARING",
        )
        form = Submission.objects.create(
            company=self.company,
            review=review,
            kind="EMPLOYEE",
            round=1,
            author=self.nimal,
        )
        form.evidence.add(r.data["id"])
        self.assertEqual(self.acting(self.hr).post(url, body, format="json").status_code, 403)
        form.submitted_at = timezone.now()
        form.save()
        self.assertEqual(self.acting(self.hr).post(url, body, format="json").status_code, 200)
        self.assertEqual(self.acting(self.hr).post(url, body, format="json").status_code, 400)
