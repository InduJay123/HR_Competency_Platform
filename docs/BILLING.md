# Annual company billing

Billing is yearly only. Existing CompanyQuote records remain estimates and are not converted into invoices. No review, coaching, Trainer, Growth Tools, hierarchy, or company suspension behavior is changed.

## Schema

Migration: `backend/apps/billing/migrations/0001_initial.py`.

- `BillingSettings`: singleton configuration, initially inactive with no fee, currency, issuer or bank account seeded.
- `CompanyInvoice`: one invoice per company/year, monetary totals, frozen settings/customer snapshot, dates, status, paid timestamp and private PDF path.
- `PaymentProof`: immutable submission metadata plus review status, reviewer, time and rejection reason. Company derives from the invoice to avoid inconsistent company IDs. Rejected attempts remain in the database.
- `InvoiceSequence`: one transaction-locked counter per year.

Constraints: `billing_settings_singleton` (ID must equal 1), `billing_company_year_unique`, unique `invoice_number`, `billing_one_pending_proof`, and the yearly sequence primary key. Foreign keys protect invoice/proof history from parent deletion. Shared UUID/timestamp patterns are reused.

## Configuration and annual issuance

Platform Super Admin opens **Billing & Payments → Billing Settings**, enters the real annual default fee, currency, issuer and payment details, annual issue month/day and due period, then activates billing. Tax is an optional percentage, rounded to two decimal places. No demo billing values are seeded.

The issue date is the configured date within the current calendar year; the due date is that date plus the configured number of days. Dates use Asia/Colombo. A February 29 issue date falls on February 28 in non-leap years. Companies first accessing billing later in the year receive the full annual fee and that year's configured issue/due dates; proration is not implemented.

The idempotent creation service runs from:

1. The existing Celery Beat schedule, once daily.
2. Saving billing settings, for eligible active companies.
3. Chief Steward dashboard/current-invoice access and Platform billing overview/invoice access.

It creates only the current year's invoice, on or after the configured issue date. Existing invoices remain visible if billing is subsequently deactivated. Historical invoices are not backfilled automatically. Chief Steward has no generation button or mutation endpoint for invoice settings/amounts.

Creation locks the company row inside a database transaction. The database company/year uniqueness constraint is the final duplicate safeguard. A yearly sequence row is also locked and incremented within the same transaction, producing `<prefix>-<year>-<six-digit-or-longer-counter>`. Changing the prefix does not reset the year's counter. PostgreSQL provides the production row-lock semantics; SQLite tests verify constraints and behavior, not PostgreSQL concurrency under load.

Each invoice freezes its annual fee, currency, tax rate/amount, issuer/bank details, customer name/location, issue date and due date at creation. Later settings changes affect only newly created invoices. Company has no street-address field; the available country is included as the customer location. No unrelated company schema was added.

## States and verification

Invoice enums are `AWAITING_PAYMENT`, `PAYMENT_PROOF_SUBMITTED`, and `PAID`. Overdue is an independent `is_overdue` calculation: unpaid and due date before today. It can coexist with a pending proof. Platform invoice filtering accepts `OVERDUE` as a computed filter, not a persisted state. Proof enums are `PENDING`, `APPROVED`, and `REJECTED`.

Chief Steward uploads against the server-selected current invoice. An invoice lock and partial unique pending-proof constraint prevent duplicate pending submissions. Uploads validate extension, declared MIME, actual parseable PDF/JPEG/PNG content, nonempty file and a 10 MiB maximum. Future payment dates are rejected. Original filenames are sanitized and never used as object keys.

Approval locks the invoice, then the proof, checks that both are awaiting review, records reviewer/time, approves the proof and marks the invoice paid in one transaction. Rejection requires a reason, records reviewer/time, leaves the invoice unpaid and permits a new proof. All old proofs remain available. Repeated/conflicting review requests are rejected. There is no separate bypass for marking paid and no automatic company suspension.

## Permissions and routes

Chief Steward: `/hr/billing`, with Current Invoice, Invoice History and Upload Payment Proof horizontal tabs; one sidebar entry and an automatic annual-invoice card on dashboards. History includes the current invoice as well as previous years.

Platform Super Admin: `/platform/billing` or the Billing & Payments entry in the existing Platform navigation, with Overview, Company Invoices, Payment Proofs and Billing Settings tabs.

The backend checks active authenticated company membership plus `is_head_hr` for Chief Steward billing. Session company selection is revalidated against membership. Uploads ignore supplied company/invoice IDs. Platform endpoints require `is_superuser`. All invoice/proof file lookups are scoped before storage access; another company's UUID returns 404. Regular HR without Chief Steward status cannot access billing.

All APIs are under `/api/v1/`:

| Method | Route |
| --- | --- |
| GET | `billing/current/` |
| GET | `billing/history/` |
| POST | `billing/current/payment-proof/` |
| GET | `billing/invoices/<uuid>/pdf/` (optional `?download=1`) |
| GET | `billing/payment-proofs/<uuid>/file/` |
| GET | `platform/billing/overview/?year=2026` |
| GET | `platform/billing/invoices/?year=2026&company=<uuid>&status=PAID` |
| GET | `platform/billing/payment-proofs/?year=2026` |
| POST | `platform/billing/payment-proofs/<uuid>/approve/` |
| POST | `platform/billing/payment-proofs/<uuid>/reject/` |
| GET, PUT | `platform/billing/settings/` |

Session authentication and CSRF protection reuse existing DRF configuration. PDF/proof responses are authenticated, `private, no-store`, and do not reveal object paths, public URLs or service credentials.

## Private Supabase storage

Create or confirm these buckets in Supabase with **Public disabled**:

- `billing-invoices`: `companies/<company-uuid>/<year>/<invoice-uuid>.pdf`
- `billing-payment-proofs`: `companies/<company-uuid>/<year>/<invoice-uuid>/<proof-uuid>.<ext>`

On 16 October 2026, the configured `billing-invoices` bucket was found public and changed to private. Both buckets were then verified private and accessible. Invoice MIME restriction and the payment-proof MIME/10 MiB restrictions were applied and verified. Storage object policy inspection found no policies granting direct client access. These checks apply to the configured project; repeat them for another deployment. Bucket options follow the [Supabase bucket update API](https://supabase.com/docs/reference/self-hosting-storage/update-properties-of-a-bucket).

Use only the existing backend `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. Do not add service credentials to any frontend or NEXT_PUBLIC environment variable. Do not grant anonymous/public object access. For proofs, configure the bucket limit to 10 MiB and allowed MIME types `application/pdf`, `image/jpeg`, `image/png`; ensure the reverse proxy also permits a 10 MiB file plus multipart overhead. The invoice bucket must permit `application/pdf`.

Every billing upload/download checks bucket metadata and fails closed when a bucket is public, missing or inaccessible. Verify with:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py check_billing_storage
```

PDFs use the existing PyMuPDF dependency. They are generated on authenticated view/download and upserted to the invoice bucket, avoiding a storage dependency during invoice issuance. Financial and issuer details stay frozen; regenerated PDFs reflect the latest payment/overdue status. The database stores object paths, never permanent public URLs.

Storage and database transactions cannot be atomic together: an upload can leave an unreferenced private object if a later database operation fails. No database row points to a failed upload. No automatic deletion/retention policy is introduced.

## Audit events

Company-scoped AuditLog actions: `billing.invoice_issued`, `billing.payment_proof_submitted`, `billing.payment_proof_approved`, `billing.payment_proof_rejected`, `billing.invoice_paid`. Automated issue events have a null actor. Verification events include proof ID and rejection reason. Settings changes create `billing.settings_updated` in PlatformEvent. Logs contain no file contents or API secrets.

## Deployment and checks

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py makemigrations --check
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test tests.test_billing tests.test_company_logo_storage tests.test_foundation --settings=config.settings.test
cd ../frontend
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/components/billing.test.tsx
npm.cmd run build
```

Keep the existing Celery worker and Beat running for proactive daily issuance. Lazy issuance still works when scheduling is unavailable. After deploy, configure and activate the real billing settings.

`frontend/tests/billing-browser.cjs` checks real browser rendering with mocked API responses at widths 320, 375, 768 and 1440, including all tabs, overflow, upload validation and approval/rejection refresh. Run against the built frontend with Playwright available, optionally setting `PLAYWRIGHT_MODULE`, `CHROME_PATH` and `BILLING_TEST_URL`. It makes no live billing changes. Backend storage tests mock object transfers; live transfers require configured private buckets.

## Verification results (16 October 2026)

- `billing.0001_initial` applied successfully to the configured database.
- `makemigrations --check`: no changes detected; `manage.py check`: no issues.
- Relevant backend suites: 51 passing tests (20 billing, 10 company-storage, 21 foundation).
- Billing frontend suite: 7 passing tests.
- Browser checks: 34 passed, including 28 tab/viewport combinations with no horizontal page overflow.
- Frontend typecheck and production build passed; targeted lint for changed frontend files passed.
- Full frontend suite: 125 passed, 5 failed in untouched purpose-journey (2), settings (1), HR review detail (1), and Trainer (1) tests.
- Full frontend lint: existing errors in `pillar-targets.tsx` (state update in effect) and `review-form.tsx` (ref access during render), plus four existing warnings. These unrelated workflows were not changed.
- Invoice PDF rendered and visually inspected; mobile Chief Steward and Platform billing screens visually inspected.
- Live storage metadata verified; object-transfer tests use mocks. No synthetic companies, invoices, or payment proofs were inserted into the configured database.

Remaining setup: deploy/restart the backend and frontend, keep Celery worker/Beat running, and enter real billing settings before activating billing. No further billing-bucket setup is required in the verified Supabase project. Confirm production proxy upload limits permit a 10 MiB proof plus multipart overhead. PostgreSQL concurrent requests were not load-tested.
