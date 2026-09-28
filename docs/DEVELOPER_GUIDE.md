# Beyond the Finish Line — developer instruction guide

26 September 2026 · Working implementation in `D:\BFL` · Local acceptance build, not a production release

## Start here

For the saved `D:\BTFL Final` package, read [Logins and AI setup](../DEVELOPER%20GUIDE%20-%20LOGINS%20AND%20AI%20SETUP.md) first. It includes all four preview accounts, corrected saved-folder commands and the separate trainer/appraisal connections.

Read `development-progress.md` for verified status, then `review-workflow.md`, `permissions.md` and `FIGMA_SCREEN_MAP.md`. The repository root README contains runnable setup and verification commands. The original `IMPLEMENTATION_AUDIT.md` records an empty repository at the start of implementation; it is not the current feature inventory.

The application is a work → appraisal → improvement platform with AI-assisted coaching. It supports employees, managers and senior leaders. The formally appointed Head of HR validates sources and records the human assessment. AI cannot assign formal ratings, finalise reviews, rank employees or make employment decisions.

## Code and service boundaries

| Location | Responsibility |
|---|---|
| `frontend/src/app` | Next.js App Router routes, authentication pages and role workspaces |
| `frontend/src/components` | Shared shell, forms, work/evidence, dashboards, review stages, coaching, onboarding and tours |
| `frontend/src/lib` | Typed API contracts, CSRF handling, review schemas and draft navigation guard |
| `backend/apps/accounts`, `companies`, `organisation` | Session identity, tenant memberships, branding, employee profiles and reporting hierarchy |
| `backend/apps/tasks`, `evidence` | Accountable assignments, progress, child delegation and private source material |
| `backend/apps/reviews`, `development` | Two-cycle workflow, sealed form rounds, immutable records and later commitments |
| `backend/apps/ai_coach` | Authorised input snapshot, n8n job lifecycle, response validation, provenance and human disposition |
| `backend/apps/notifications`, `audit` | Recipient-scoped notifications, scheduled reminders and append-only audit history |
| `backend/tests` | PostgreSQL permission, workflow, immutability and AI contract tests |
| `n8n/workflows` | Inactive importable OpenAI Responses workflow template; credential references only |
| `scripts` | Local secret initialization, backups, isolated restore verification and design mapping |

The browser calls same-origin `/api/v1/`; Next.js proxies to Django. Django enforces all roles, company boundaries, object relationships and state transitions. Context switching changes navigation, not authority. PostgreSQL stores records; private storage holds evidence bytes. Redis/Celery process notifications and coaching. No secret belongs in `NEXT_PUBLIC_*`.

## Implement and preserve the complete journey

1. **Set up the organisation.** HR sets company name, tagline and logo, departments, job roles, people and reporting lines. Use the employee's joining date for “Since …”. Reject self-reporting and cycles. Do not grant roles based on job-title text.
2. **Assign meaningful work.** Only managers may assign active direct reports. Capture an expected outcome, deadline and priority. Delegation creates a child assignment while retaining the parent's accountable manager. Only the assignee records their progress, blockers and results.
3. **Capture sources.** Evidence belongs to authorised work. Notes, HTTPS references and private PDF/PNG/JPEG uploads are supported. A link is not fetched automatically. Downloads recheck permission and return an attachment; storage keys are not public URLs.
4. **Launch a formal cycle.** Only Mid-Year and Year-End exist. HR previews eligible employees and an independent Head of HR, then launches deliberately. Missing managers and invalid relationships prevent launch. Year-End requires the employee's final Mid-Year baseline.
5. **Prepare independent forms.** Employee reflection and manager appraisal have separate private drafts. The manager uses ECP, five qualitative pillars, stewardship tools and conditional execution-gap diagnosis. Senior reviews require strategic results, leadership support and sustainable-system context.
6. **Submit and protect.** Autosave uses optimistic versioning. A stale write returns 409 and retains local content; never silently overwrite another tab. Submission seals that round. The manager sees submitted employee content; the employee sees the submitted manager appraisal once both have submitted.
7. **Validate before coaching.** Only the explicitly appointed Head of HR can validate evidence selected in a current submitted form. Each source is validated with an authorised excerpt or excluded with a reason. Both sealed forms and completed source validation are required before requesting AI.
8. **Treat AI as advice.** The server snapshots authorised inputs, hashes them and records model/prompt provenance. Validate provider output shape and every citation. Unknown sources, added rating fields and invalid responses fail safely. Head of HR accepts/rejects coaching separately. A documented human-only reason allows progress when AI is unavailable.
9. **Agree the next steps.** Head of HR records the human assessment and employee/manager conversation, with 3–5 commitments. Each has an owner, action, support, success measure and due date. The employee may add their own comments when acknowledging. Acknowledgement means receipt/participation, not agreement.
10. **Freeze and follow through.** Both participants acknowledge before Head of HR finalisation. PostgreSQL protects the snapshot and sealed forms. Revision before finalisation starts another round and retains prior submissions. Later development updates never rewrite the frozen agreement. Year-End assesses each Mid-Year commitment as Met, Partially Met or Missed with rationale.

## Review content and confidentiality

The source PDFs distinguish a private pre-workshop self-evaluation workbook from the formal appraisal. Private WHY and personal workshop answers are not requested by this implementation and must not be automatically submitted to HR or AI. See the source interpretation in `review-workflow.md` before extending the forms.

General HR oversight exposes workflow status, not arbitrary private appraisal narratives. Roles do not confer unrestricted AI access. Head of HR cannot review their own evidence; employee and manager identities must remain distinct. Cross-company object requests are hidden with 404 responses. Version conflicts return 409; invalid state or content returns 400; disallowed actions return 403.

## Frontend implementation rules

- Use the Figma mapping and native frames as the visual reference. The current 33 routes implement the core journey, but the mapping identifies remaining detailed parity work. Do not call a screen complete solely because it renders.
- Preserve the white desktop web canvas, Geist typography, blue accents/gradients, company identity and ICORENIC attribution. Responsive layouts adapt the same web interface.
- Forms must expose real loading, empty, error, conflict and submitted states. Never substitute invented data after an API failure.
- Review drafts retain unsaved edits across a failed save. Confirm before discarding them on navigation/context changes. Submitted forms are read-only.
- Onboarding is after login and can be replayed. Guidance has optional Employee, Manager and HR tours; Escape closes and returns focus. Tooltips support keyboard focus and Escape.
- Keep movement subtle and honour reduced-motion preferences. The AI character is an entry point to an authorised coaching state, not evidence that live AI is connected.

## Live service setup

Configure secrets in the server environment or secret manager. Do not paste them into chat, source control, frontend code or screenshots.

| Service | Setup and verification |
|---|---|
| PostgreSQL / Redis | Production TLS/private networking, non-owner runtime DB account, separate migration role, managed worker/beat, monitoring |
| Supabase storage | Private bucket, backend-only service key; test denied unauthenticated access and permitted tenant download; add malware quarantine/scanning before customer files |
| n8n / OpenAI | Import the supplied inactive workflow, bind credential references, configure fixed HTTPS webhook/token and model, activate deliberately; run the synthetic checklist in `ai.md` |
| SMTP | Verified sender, production origin for reset/invitation URLs, delivery monitoring and bounce/error handling |

The development email backend is in-memory. Live OpenAI, n8n, Supabase and SMTP have not been verified. The AI tests mock provider responses. Do not present them as successful live analysis.

## Test and release procedure

Run README checks from a clean dependency install. Backend tests must use PostgreSQL for the immutability triggers; the optional SQLite settings do not prove those guarantees. Frontend checks include lint, TypeScript, critical interaction tests and the production build.

Use synthetic identities to test HR setup → manager assignment → employee updates/evidence → Mid-Year submissions → appointed HR validation → AI success/failure/manual continuation → conversation → both acknowledgements → final record → commitment progress → Year-End comparison. Also test foreign-company IDs, role changes, missing evidence, stale tabs, invalid hierarchy, worker interruption and final-record tampering.

Before customer release, finish the remaining screen comparison and full browser/keyboard/accessibility acceptance, configure live services, add file malware controls, review security and load behaviour, then rehearse encrypted database/private-storage recovery. The documented local restore drill does not certify production disaster recovery. Deployment and rollback steps are in `deployment.md`.

## Current delivery status

The core application, database migrations, API, tests, local service setup and developer documentation are present. A runnable local production build is available. Outstanding release work is explicit in `development-progress.md`; this handover is not a production sign-off or a claim of complete Figma parity.

## Profile, journal and training additions

See TRAINER_SETUP.md for server-only OpenAI credentials, conversation limits and live verification. The personal profile endpoint now returns private contact fields; the people directory serializer deliberately does not. Photo uploads validate and re-encode PNG/JPEG bytes and serve through authenticated employee scope. Employment company is descriptive and cannot change membership; joining date is HR-managed.

Growth entries are authored observations scoped to a subject employee, with optimistic version checks, optional sharing and reversible archive. Managers may author capability observations only for direct reports. These journals do not automatically become authorised appraisal evidence or trainer inputs.

Apply all migrations and restart web/worker/beat. Dedicated invitations route to /auth/accept-invitation; existing password resets retain /auth/reset-password. The seven-page user guide is in the same docs folder. Keep the local preview account out of production.


## Platform and company access — 27 September 2026

See PLATFORM_ACCESS_GUIDE.md for company registration, Head of HR approval, employee joining requests, permanent stewardship codes, global super-admin oversight, saved pricing quotes and company branding. LOCAL_PREVIEW_LOGINS.md contains the local role preview accounts. These changes are in code, not a Figma sync.
