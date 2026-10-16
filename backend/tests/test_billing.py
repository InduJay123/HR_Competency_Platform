import io
from datetime import timedelta
from unittest.mock import patch

import pymupdf as fitz
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.billing.models import BillingSettings, CompanyInvoice, PaymentProof
from apps.billing.services import ensure_invoice, overdue, today
from apps.companies.models import Company
from tests import test_foundation


class BillingTests(TestCase):
    person = test_foundation.FoundationTests.person
    acting = test_foundation.FoundationTests.acting

    def setUp(self):
        self.company = Company.objects.create(name="Test company", slug="billing-test")
        self.other = Company.objects.create(name="Other", slug="billing-other")
        self.head = self.person("billing-head", self.company, hr=True)
        self.staff = self.person("billing-staff", self.company)
        self.other_head = self.person("billing-other", self.other, hr=True)
        self.client = self.acting(self.head)
        self.admin = APIClient()
        self.admin.force_login(
            get_user_model().objects.create_superuser(
                username="billing-admin", email="billing-admin@example.test", password="test"
            )
        )
        self.settings = BillingSettings.objects.create(
            annual_fee="1000",
            currency="LKR",
            invoice_prefix="TEST",
            issuer_name="Test issuer",
            bank_name="Test bank",
            bank_account_name="Test account",
            bank_account_number="123",
            active=True,
        )
        self.invoice = ensure_invoice(self.company.pk)
        self.put = patch("apps.billing.views.storage.put").start()
        self.get = patch("apps.billing.views.storage.get", return_value=b"private").start()
        self.addCleanup(patch.stopall)

    def file(self, extension="pdf"):
        if extension == "pdf":
            doc = fitz.open()
            doc.new_page()
            content = doc.tobytes()
            doc.close()
            mime = "application/pdf"
        else:
            stream = io.BytesIO()
            Image.new("RGB", (10, 10)).save(stream, "PNG" if extension == "png" else "JPEG")
            content = stream.getvalue()
            mime = "image/png" if extension == "png" else "image/jpeg"
        return SimpleUploadedFile(f"proof.{extension}", content, content_type=mime)

    def upload(self, file=None, **extra):
        return self.client.post(
            "/api/v1/billing/current/payment-proof/",
            {
                "file": file or self.file(),
                "transaction_reference": "ref-123",
                "payment_date": str(today()),
                **extra,
            },
            format="multipart",
        )

    def verify(self, proof, decision="approve", client=None, **data):
        return (client or self.admin).post(
            f"/api/v1/platform/billing/payment-proofs/{proof}/{decision}/", data, format="json"
        )

    def test_idempotent_and_unique_company_year(self):
        self.assertEqual(ensure_invoice(self.company.pk).pk, self.invoice.pk)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.invoice.pk = None
            self.invoice.invoice_number = "different"
            self.invoice.save(force_insert=True)

    def test_unique_numbering(self):
        other = ensure_invoice(self.other.pk)
        self.assertNotEqual(other.invoice_number, self.invoice.invoice_number)
        with self.assertRaises(IntegrityError), transaction.atomic():
            other.invoice_number = self.invoice.invoice_number
            other.save()

    def test_current_and_history_isolation(self):
        other = ensure_invoice(self.other.pk)
        self.assertEqual(self.client.get("/api/v1/billing/current/").data["id"], str(self.invoice.pk))
        self.assertEqual(len(self.client.get("/api/v1/billing/history/").data), 1)
        self.assertEqual(self.client.get(f"/api/v1/billing/invoices/{other.pk}/pdf/").status_code, 404)
        self.put.assert_not_called()

    def test_non_chief_denied(self):
        client = self.acting(self.staff)
        for route in [
            "billing/current/",
            "billing/history/",
            "platform/billing/settings/",
            "platform/billing/invoices/",
        ]:
            self.assertEqual(client.get("/api/v1/" + route).status_code, 403)

    def test_valid_formats_and_private_paths(self):
        for extension in ["pdf", "jpg", "jpeg", "png"]:
            response = self.upload(
                self.file(extension),
                company_id=str(self.other.pk),
                invoice=str(ensure_invoice(self.other.pk).pk),
            )
            self.assertEqual(response.status_code, 201, response.data)
            proof = PaymentProof.objects.get(pk=response.data["id"])
            self.assertEqual(proof.invoice_id, self.invoice.pk)
            self.assertTrue(
                proof.storage_path.startswith(
                    f"companies/{self.company.pk}/{today().year}/{self.invoice.pk}/"
                )
            )
            self.assertEqual(self.put.call_args.kwargs["bucket"], "billing-payment-proofs")
            self.verify(proof.pk, "reject", rejection_reason="Unreadable")
        self.assertEqual(PaymentProof.objects.count(), 4)

    def test_size_mime_extension_and_content_validation(self):
        for upload in [
            SimpleUploadedFile("large.pdf", b"a" * (10 * 1024 * 1024 + 1), content_type="application/pdf"),
            SimpleUploadedFile("proof.pdf", b"bad", content_type="text/plain"),
            SimpleUploadedFile("proof.exe", b"bad", content_type="application/pdf"),
            SimpleUploadedFile("fake.png", b"bad", content_type="image/png"),
        ]:
            self.assertEqual(self.upload(upload).status_code, 400)
        self.assertEqual(PaymentProof.objects.count(), 0)
        self.put.assert_not_called()

    def test_approval_permissions_paid_history_and_duplicate_review(self):
        proof = self.upload().data["id"]
        self.assertEqual(self.verify(proof, client=self.client).status_code, 403)
        self.assertEqual(self.verify(proof).status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "PAID")
        row = PaymentProof.objects.get(pk=proof)
        self.assertIsNotNone(row.verified_by_id)
        self.assertIsNotNone(row.verified_at)
        self.assertEqual(self.verify(proof).status_code, 400)
        self.assertEqual(self.upload().status_code, 400)
        self.assertEqual(self.client.get("/api/v1/billing/history/").data[0]["status"], "PAID")
        self.assertTrue(AuditLog.objects.filter(action="billing.invoice_paid", company=self.company).exists())

    def test_rejection_preserved_and_replacement(self):
        proof = self.upload().data["id"]
        self.assertEqual(self.verify(proof, "reject").status_code, 400)
        self.assertEqual(self.verify(proof, "reject", rejection_reason="Wrong reference").status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "AWAITING_PAYMENT")
        self.assertEqual(self.upload().status_code, 201)
        self.assertEqual(PaymentProof.objects.get(pk=proof).rejection_reason, "Wrong reference")
        self.assertEqual(PaymentProof.objects.count(), 2)

    def test_proof_access_isolation_and_admin(self):
        proof = self.upload().data["id"]
        url = f"/api/v1/billing/payment-proofs/{proof}/file/"
        self.assertEqual(self.acting(self.other_head).get(url).status_code, 404)
        self.get.assert_not_called()
        self.assertEqual(self.admin.get(url).status_code, 200)
        self.assertEqual(self.get.call_args.kwargs["bucket"], "billing-payment-proofs")
        self.assertEqual(self.client.get(url)["Cache-Control"], "private, no-store")

    def test_pending_submission_cannot_be_duplicated(self):
        self.upload()
        self.assertEqual(self.upload().status_code, 400)
        self.assertEqual(PaymentProof.objects.count(), 1)

    def test_overdue_boundary(self):
        self.invoice.due_at = today()
        self.assertFalse(overdue(self.invoice))
        self.invoice.due_at -= timedelta(days=1)
        self.assertTrue(overdue(self.invoice))
        self.invoice.status = "PAID"
        self.assertFalse(overdue(self.invoice))

    def test_settings_freeze_and_future_issue(self):
        self.settings.annual_fee = 2000
        self.settings.issuer_name = "New issuer"
        self.settings.save()
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.snapshot["issuer_name"], "Test issuer")
        self.assertEqual(self.invoice.amount, 1000)
        self.assertEqual(ensure_invoice(self.other.pk).amount, 2000)
        self.settings.issue_month = 12
        self.settings.issue_day = 31
        self.settings.save()
        self.assertIsNone(
            ensure_invoice(self.company.pk, today().replace(year=today().year + 1, month=1, day=1))
        )

    def test_pdf_generation_storage_and_no_secret(self):
        response = self.client.get(f"/api/v1/billing/invoices/{self.invoice.pk}/pdf/?download=1")
        self.assertEqual(response.status_code, 200)
        with fitz.open(stream=response.content, filetype="pdf") as doc:
            text = "".join(page.get_text() for page in doc)
            self.assertIn(self.invoice.invoice_number, text)
            self.assertIn("Test issuer", text)
        self.assertEqual(self.put.call_args.kwargs["bucket"], "billing-invoices")
        self.invoice.refresh_from_db()
        self.assertTrue(self.invoice.invoice_storage_path.endswith(f"/{self.invoice.pk}.pdf"))
        payload = str(self.client.get("/api/v1/billing/current/").data)
        self.assertNotIn("storage_path", payload)
        self.assertNotIn("SERVICE_KEY", payload)

    def test_settings_validation_admin_only_and_initialization(self):
        self.assertEqual(
            self.client.put("/api/v1/platform/billing/settings/", {}, format="json").status_code, 403
        )
        data = self.admin.get("/api/v1/platform/billing/settings/").data
        data["issue_month"] = 13
        self.assertEqual(
            self.admin.put("/api/v1/platform/billing/settings/", data, format="json").status_code, 400
        )
        data["issue_month"] = 1
        self.assertEqual(
            self.admin.put("/api/v1/platform/billing/settings/", data, format="json").status_code, 200
        )
        self.assertTrue(CompanyInvoice.objects.filter(company=self.other).exists())

    def test_storage_failure_rolls_back_submission(self):
        from apps.evidence.storage import StorageUnavailable

        self.put.side_effect = StorageUnavailable()
        self.assertEqual(self.upload().status_code, 503)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "AWAITING_PAYMENT")
        self.assertFalse(PaymentProof.objects.exists())

    def test_forged_session_and_hr_without_chief_are_denied(self):
        client = self.acting(self.head)
        session = client.session
        session["company_id"] = str(self.other.pk)
        session.save()
        self.assertEqual(client.get("/api/v1/billing/current/").status_code, 403)
        self.staff.is_hr = True
        self.staff.save()
        self.assertEqual(self.acting(self.staff).get("/api/v1/billing/current/").status_code, 403)
        self.assertEqual(APIClient().get("/api/v1/billing/history/").status_code, 403)

    def test_approval_rolls_back_if_audit_fails(self):
        proof = self.upload().data["id"]
        with patch("apps.billing.views.audit", side_effect=RuntimeError("audit unavailable")):
            with self.assertRaises(RuntimeError):
                self.verify(proof)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "PAYMENT_PROOF_SUBMITTED")
        self.assertEqual(PaymentProof.objects.get(pk=proof).status, "PENDING")

    def test_pending_proof_database_constraint(self):
        self.upload()
        proof = PaymentProof.objects.get()
        with self.assertRaises(IntegrityError), transaction.atomic():
            proof.pk = None
            proof.save(force_insert=True)

    def test_inactive_billing_and_future_payment(self):
        self.settings.active = False
        self.settings.save()
        self.assertIsNone(ensure_invoice(self.other.pk))
        self.assertEqual(self.upload(payment_date=str(today() + timedelta(days=1))).status_code, 400)

    @override_settings(SUPABASE_URL="https://storage.example.test", SUPABASE_SERVICE_KEY="test-only")
    def test_storage_requires_private_bucket(self):
        from apps.billing.storage import require_private_bucket
        from apps.evidence.storage import StorageUnavailable

        with patch("apps.billing.storage.requests.get") as get:
            get.return_value.status_code = 200
            for body in [{"public": True}, {}, {"public": "false"}]:
                get.return_value.json.return_value = body
                with self.assertRaises(StorageUnavailable):
                    require_private_bucket("billing-invoices")
            get.return_value.json.return_value = {"public": False}
            require_private_bucket("billing-invoices")
            get.return_value.status_code = 404
            with self.assertRaises(StorageUnavailable):
                require_private_bucket("billing-payment-proofs")
