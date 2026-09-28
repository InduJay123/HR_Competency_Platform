from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.companies.models import AccessRequest, Company, CompanyQuote, Membership, PlatformEvent
from apps.companies.pricing import calculate
from tests import test_foundation


class PlatformAccessTests(TestCase):
    person = test_foundation.FoundationTests.person
    acting = test_foundation.FoundationTests.acting

    def setUp(self):
        cache.clear()
        self.company = Company.objects.create(name="Atlas", slug="atlas")
        self.other = Company.objects.create(name="Other", slug="other")
        self.hr = self.person("head", self.company, hr=True)
        self.other_hr = self.person("other", self.other, hr=True)
        self.employee = self.person("worker", self.company)
        self.admin = get_user_model().objects.create_superuser(
            username="platform@test.example",
            email="platform@test.example",
            password="Development-password-2026!",
        )
        self.platform = APIClient()
        self.platform.force_login(self.admin)
        self.public = APIClient()

    def registration(self, **extra):
        return {
            "kind": "COMPANY",
            "email": "newhr@test.example",
            "password": "Strong-request-password-42!",
            "first_name": "Jamie",
            "last_name": "Example",
            "phone": "+94 77 123 4567",
            "designation": "Head of HR",
            "company_name": "New Company",
            "nature": "Manufacturing",
            "country": "Sri Lanka",
            "market": "SL",
            "employee_count": 300,
            **extra,
        }

    def test_company_approval_is_required_and_provisions_head_hr(self):
        r = self.public.post("/api/v1/auth/register/", self.registration(), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        req = AccessRequest.objects.get(pk=r.data["id"])
        self.assertNotIn("password", req.details)
        self.assertFalse(Membership.objects.filter(user=req.user).exists())
        login = self.public.post(
            "/api/v1/auth/login/",
            {"email": req.user.email, "password": "Strong-request-password-42!"},
            format="json",
        )
        self.assertEqual(login.data["redirect"], "/auth/request-status")
        self.assertEqual(self.public.get("/api/v1/employees/").status_code, 403)
        self.assertEqual(
            self.acting(self.hr)
            .post(
                f"/api/v1/access-requests/{req.id}/decide/",
                {"decision": "APPROVED", "note": "verified"},
                format="json",
            )
            .status_code,
            404,
        )
        r = self.platform.post(
            f"/api/v1/access-requests/{req.id}/decide/",
            {"decision": "APPROVED", "note": "Company and HR authority verified."},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        req.refresh_from_db()
        m = Membership.objects.get(user=req.user)
        self.assertTrue(m.is_head_hr and m.is_hr)
        self.assertTrue(m.stewardship_code.endswith("-1"))
        self.assertEqual(m.company.declared_employees, 300)
        self.assertIsNotNone(m.approved_at)
        self.assertEqual(
            self.platform.post(
                f"/api/v1/access-requests/{req.id}/decide/",
                {"decision": "APPROVED", "note": "repeat"},
                format="json",
            ).status_code,
            409,
        )
        r = self.public.post(
            "/api/v1/auth/login/",
            {"email": req.user.email, "password": "Strong-request-password-42!", "role": "hr"},
            format="json",
        )
        self.assertEqual(r.data["redirect"], "/hr/dashboard")

    def test_employee_cannot_grant_self_manager_or_cross_tenant_access(self):
        r = self.public.post(
            "/api/v1/auth/register/",
            self.registration(
                kind="EMPLOYEE",
                email="join@test.example",
                company_code=self.company.stewardship_code,
                role="HR",
                is_hr=True,
                joined_on="2020-02-01",
            ),
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        req = AccessRequest.objects.get(pk=r.data["id"])
        endpoint = f"/api/v1/access-requests/{req.id}/decide/"
        data = {"decision": "APPROVED", "note": "Employment verified", "role": "MANAGER"}
        self.assertEqual(self.acting(self.other_hr).post(endpoint, data, format="json").status_code, 404)
        self.assertEqual(self.acting(self.employee).post(endpoint, data, format="json").status_code, 403)
        self.assertEqual(self.platform.post(endpoint, data, format="json").status_code, 404)
        r = self.acting(self.hr).post(endpoint, data, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        m = Membership.objects.get(user=req.user)
        self.assertTrue(m.is_manager)
        self.assertFalse(m.is_hr)
        self.assertEqual(str(m.profile.joined_on), "2020-02-01")
        self.assertEqual(m.stewardship_code, f"{self.company.stewardship_code}-3")

    def test_role_login_is_authorisation_not_selection(self):
        r = self.public.post(
            "/api/v1/auth/login/",
            {"email": self.employee.user.email, "password": "Long-secret-example-123!", "role": "platform"},
            format="json",
        )
        self.assertEqual(r.status_code, 403)
        r = self.public.post(
            "/api/v1/auth/login/",
            {"email": self.employee.user.email, "password": "Long-secret-example-123!", "role": "hr"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.acting(self.hr).get("/api/v1/platform/overview/").status_code, 403)
        self.assertEqual(self.acting(self.hr).get("/api/v1/platform/companies/").status_code, 403)
        r = self.public.post(
            "/api/v1/auth/login/",
            {"email": self.admin.email, "password": "Development-password-2026!", "role": "platform"},
            format="json",
        )
        self.assertEqual(r.data["redirect"], "/platform")
        self.assertTrue(self.public.get("/api/v1/auth/session/").data["is_platform_admin"])

    def test_decline_does_not_activate_user_and_suspension_blocks_existing_session(self):
        r = self.public.post("/api/v1/auth/register/", self.registration(), format="json")
        req = AccessRequest.objects.get(pk=r.data["id"])
        self.platform.post(
            f"/api/v1/access-requests/{req.id}/decide/",
            {"decision": "REJECTED", "note": "Authority could not be verified."},
            format="json",
        )
        self.assertFalse(Membership.objects.filter(user=req.user).exists())
        client = self.acting(self.hr)
        self.assertEqual(client.get("/api/v1/employees/").status_code, 200)
        self.platform.post(
            f"/api/v1/platform/companies/{self.company.id}/access/",
            {"active": False, "note": "Suspended by owner"},
            format="json",
        )
        self.assertEqual(client.get("/api/v1/employees/").status_code, 403)

    def test_stable_unique_codes_and_superadmin_excluded_from_company_directory(self):
        original = self.hr.stewardship_code
        self.hr.active = False
        self.hr.save()
        self.hr.active = True
        self.hr.save()
        self.assertEqual(self.hr.stewardship_code, original)
        self.assertNotEqual(self.company.stewardship_code, self.other.stewardship_code)
        membership = Membership.objects.create(user=self.admin, company=self.company)
        from apps.organisation.models import EmployeeProfile

        EmployeeProfile.objects.create(membership=membership, company=self.company)
        results = self.acting(self.hr).get("/api/v1/employees/").data["results"]
        self.assertNotIn(self.admin.email, [p["email"] for p in results])

    def test_csrf_required_for_public_registration(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(
            client.post("/api/v1/auth/register/", self.registration(), format="json").status_code, 403
        )

    def test_pricing_all_boundaries_and_markets(self):
        for market, prices in {
            "SL": [150000, 350000, 500000, 750000],
            "REGIONAL": [299, 999, 1667, 2499],
            "GLOBAL": [999, 2499, 4999, 7999],
        }.items():
            for count, index in [(1, 0), (50, 0), (51, 1), (250, 1), (251, 2), (500, 2), (501, 3), (1000, 3)]:
                with self.subTest(market=market, count=count):
                    self.assertEqual(
                        calculate({"market": market, "employees": count})["annual_licence"], prices[index]
                    )
            self.assertIsNone(calculate({"market": market, "employees": 1001})["annual_licence"])
        quote = calculate(
            {
                "market": "GLOBAL",
                "employees": 2000,
                "white_label": True,
                "workshop": True,
                "coaching_quarters": 4,
            }
        )
        self.assertEqual(quote["first_year_total"], 22667)
        self.assertEqual(
            self.acting(self.hr)
            .post("/api/v1/platform/pricing/", {"market": "SL", "employees": 5}, format="json")
            .status_code,
            403,
        )

    def test_quotes_persist_and_understated_count_or_unexplained_override_rejected(self):
        endpoint = f"/api/v1/platform/companies/{self.company.id}/quote/"
        self.assertEqual(
            self.platform.post(endpoint, {"market": "SL", "employees": 1}, format="json").status_code, 400
        )
        self.assertEqual(
            self.platform.post(
                endpoint, {"market": "SL", "employees": 300, "custom_annual": "100"}, format="json"
            ).status_code,
            400,
        )
        r = self.platform.post(
            endpoint, {"market": "SL", "employees": 300, "note": "Standard annual licence"}, format="json"
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(CompanyQuote.objects.get().calculation["annual_licence"], 500000)
        self.assertTrue(PlatformEvent.objects.filter(action="company.quote_saved").exists())

    def test_existing_email_cannot_be_taken_over(self):
        r = self.public.post(
            "/api/v1/auth/register/", self.registration(email=self.hr.user.email), format="json"
        )
        self.assertEqual(r.status_code, 400)
        self.hr.user.refresh_from_db()
        self.assertTrue(self.hr.user.check_password("Long-secret-example-123!"))

    def test_final_report_is_platform_only_and_audited(self):
        from datetime import date

        from apps.reviews.models import FinalSnapshot, Review, ReviewCycle

        cycle = ReviewCycle.objects.create(
            company=self.company,
            year=2026,
            kind="MID_YEAR",
            starts_on=date(2026, 1, 1),
            ends_on=date(2026, 6, 30),
            due_on=date(2026, 7, 10),
        )
        review = Review.objects.create(
            company=self.company,
            cycle=cycle,
            employee=self.employee.profile,
            manager=self.hr.profile,
            reviewer=self.hr,
        )
        snapshot = FinalSnapshot.objects.create(
            company=self.company,
            review=review,
            content={"assessment": "A human-reviewed final record"},
            sha256="a" * 64,
        )
        endpoint = f"/api/v1/platform/reports/{snapshot.id}/"
        self.assertEqual(self.acting(self.hr).get(endpoint).status_code, 403)
        self.assertEqual(self.acting(self.employee).get(endpoint).status_code, 403)
        r = self.platform.get(endpoint)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["content"], snapshot.content)
        self.assertTrue(
            PlatformEvent.objects.filter(action="platform.final_report_read", company=self.company).exists()
        )

    def test_company_logo_preserves_transparency_and_rejects_foreign_upload(self):
        import io

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        def photo():
            stream = io.BytesIO()
            Image.new("RGBA", (40, 20), (30, 60, 200, 0)).save(stream, format="PNG")
            return SimpleUploadedFile("company.png", stream.getvalue(), content_type="image/png")

        endpoint = f"/api/v1/company-logo/{self.company.id}/"
        self.assertEqual(
            self.acting(self.other_hr).post(endpoint, {"logo": photo()}, format="multipart").status_code, 403
        )
        r = self.acting(self.hr).post(endpoint, {"logo": photo()}, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        response = self.public.get(endpoint)
        self.assertEqual(response.status_code, 200)
        image = Image.open(io.BytesIO(response.content))
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.getpixel((0, 0))[3], 0)
