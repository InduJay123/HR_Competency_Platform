# Architecture

## Ownership
- **Next.js App Router / React / TypeScript** renders the web experience and accessible forms. It does not decide tenant or review permissions. Shared components and tokens live in `frontend/src/components` and `frontend/src/app/*.css`.
- **Django + DRF** owns session authentication, CSRF, tenant membership, reporting hierarchy, work ownership, evidence authorisation and the review state machine. All business writes use explicit service functions and database transactions.
- **PostgreSQL** holds tenant-scoped domain data. Version checks prevent silent lost updates; row locks serialize concurrent transitions. Database triggers protect historical records.
- **Private storage** uses a local directory in development or a server-only Supabase Storage adapter. Files are retrieved through a permission-checked API; storage keys are never exposed by serializers.
- **Celery / Redis** runs email and AI work independently of HTTP requests. The worker calls an authenticated n8n webhook. n8n alone holds the OpenAI credential.

## Boundaries
Every authenticated API resolves the company from an active user membership and session, not a client-supplied company field. Changing context grants no permissions. HR may monitor all review states; narrative access requires participation or explicit Head of HR appointment. A platform administrator should use a separately audited company bootstrap process, not impersonate reviewers.

The schema uses normalized relationships for organisation/work/review identity and versioned JSON for formal questionnaire content. `reviews/schemas.py` validates the content contract. This is deliberate: historical questionnaires must remain readable if a future template changes. Add a formal template-version migration before introducing configurable customer questionnaires; do not reinterpret existing snapshots.

## Frontend composition
Semantic controls reproduce the Figma layout using Geist, white surfaces, restrained borders and blue accents. Exact static hero artwork is used only as decoration; forms remain actual accessible inputs. No mock API fallback is allowed. Loading, validation failures, permission denial, empty state and provider unavailability are real states.

## Production work still required
Configure and exercise external integrations, malware scanning/quarantine, complete invitation delivery observability, durable queue reconciliation, production role separation, load testing and staging release checks. See progress and deployment documents; these are not claims of completed deployment.
