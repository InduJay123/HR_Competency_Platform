# Development progress

Updated 2026-09-26. **Working local implementation; not an accepted production release.** All project files are under D:\BFL. Earlier C: prototypes were not modified.

| Area | Current state | Remaining acceptance |
|---|---|---|
| Foundation | Next.js/React/strict TypeScript, Django/DRF, PostgreSQL 17, Redis, sessions/CSRF | Staging, TLS/proxy, least-privilege runtime DB role |
| Company/people | Tenant membership, branding, profiles/joining date, departments/roles, reporting hierarchy, bootstrap, invitation queue | Live SMTP, advanced hierarchy UI, full inactive-account administration |
| Work | Direct-report assignment, child delegation, accountability, edits/cancellation, updates/blockers/results | Full browser acceptance for every transition |
| Evidence | Private files, notes/HTTPS links, downloads, appointed Head of HR validation/exclusion of current submitted sources | Live Supabase, quarantine/malware scanning |
| Reviews | Mid-Year/Year-End, launch readiness, independent drafts, autosave, sealed submissions, revision rounds | Customer approval of exact digital form wording |
| Appraisal | ECP, five qualitative pillars, stewardship sections, human summary, senior leadership fields | Full Figma parity and browser review |
| AI | n8n/OpenAI adapter, strict source/schema checks, retries, interrupted-job recovery, provenance, HR decision | Credentials/model, imported active workflow, synthetic live tests |
| Human workflow | Head of HR assessment, conversation, 3–5 commitments, employee comments, two acknowledgements, immutable snapshot | Customer end-to-end acceptance |
| Development | Progress/history/evidence, manager support, linked development work | Full browser acceptance after finalisation |
| Year-End | Immutable Mid-Year baseline and Met/Partially Met/Missed comparison | Customer scenario validation |
| Monitoring | Real scoped dashboards, department progress, filters, CSV, in-app notifications/reminder tasks | Live delivery and production queue monitoring |
| Visual/onboarding | White desktop web, blue accents, Geist, company identity, five post-login slides, role tours, keyboard tooltips | Remaining Figma variants and standalone growth tools |
| Release | Tests, build, CI definition, backup/restore scripts, deployment/rollback docs | Remote CI, security/accessibility/load review, live integrations, sign-off |

## Verified results

- **55 backend tests passed against PostgreSQL** in 61.8 seconds: tenant/role boundaries, hierarchy, evidence, immutability, complete Mid-Year → Year-End, development, reports and AI contracts/failures. After tightening evidence appointment checks, the affected 24 evidence/review/AI tests passed again. AI responses are mocked.
- **9 frontend tests passed**: API CSRF/errors; reflection autosave concurrency, conflict preservation, navigation discard/keep, sealed read-only submissions and keyboard tooltips.
- Frontend lint and strict TypeScript passed. Backend Ruff passed; no missing migrations.
- Optimised Next.js production build passed with **33 routes**, including root/not-found.
- PostgreSQL migrations succeeded. Latest backup backups/bfl-20260926-105424.dump restored to an isolated temporary database: 32 migration records, one company, two synthetic tasks, six immutability triggers. Active database unchanged.
- Browser checks: real sign-in/context switch; assignment saved and listed; post-login onboarding; HR cycle preview/launch; manual draft save and autosave surviving reload; manager tour context/step navigation, highlighted expected outcome, Escape focus return; reflection tooltip open/Escape close.
- Dashboard tested at 1440, 768 and 390 pixels. Table overflow at 390 was fixed and document width verified equal to viewport width. This is representative QA, not all-screen certification.
- npm audit reported zero known vulnerabilities in the installed tree; this is not a security certification.

## Local services and test data

PostgreSQL/Redis run in Docker Compose. Django: 127.0.0.1:8000. Next.js: 127.0.0.1:3000. A local Celery worker is available; production needs managed Linux worker/beat. Development email is in-memory and sends no external email.

The explicit development seed uses Atlas Holdings and synthetic Kavindi, Sarah, Nimal and Kamal identities. Browser QA added a labelled test task and a 2026 Mid-Year cycle for Nimal with a synthetic draft. No real employment assessment was made; no provider received appraisal data.

## Release blockers

1. Configure OpenAI/n8n, private Supabase and SMTP securely on the server. Verify success/refusal/timeout/retry, source boundaries, private downloads and delivery with synthetic data. Do not put secrets in chat or browser code.
2. Complete remaining visual/growth variants in FIGMA_SCREEN_MAP.md and full role/keyboard/accessibility acceptance. Review drafts now guard unsaved in-app navigation; a richer conflict reconciliation interface remains desirable.
3. Add/test upload quarantine and malware scanning before customer files; complete security/load review, shared production rate limits and queue monitoring.
4. Rehearse production restore/rollback with storage backups and agreed recovery objectives. Obtain customer approval of content and the complete journey.

Do not represent the local build, mocked AI tests or frontend production build as a production-ready deployment. IMPLEMENTATION_AUDIT.md is the original empty-repository baseline; this file records subsequent implementation.


## 2026-09-26 — temporary admin and responsive Figma pass

Created the explicitly requested local preview account admin@gmail.com, named Bradly Emerson, in Atlas Holdings. HR, Head of HR and Manager contexts are available; this is not a Django global superuser. Its password is hashed in the local database and is not recorded in source or documentation. No Gmail mailbox or external email was created. The creation command is DEBUG-only, rejects existing identities, and receives the password from BFL_PREVIEW_PASSWORD. Normal password validation remains unchanged. Remove the preview account before copying development data into a deployed environment.

Removed the sign-in 1440px width cap and fixed artwork sizing, responsive grids, whitespace, table containment and shared navigation. Applied native Figma wordmark/icons and recovery artwork. Preserved white backgrounds, blue accents and actual company/user data. My Team includes the Figma support banner with a working blocked-work filter. Search navigates existing workspace pages. Narrow-screen menu now traps keyboard focus, makes background content inert and returns focus to Menu on Escape/Close.

Validation: three new preview-account backend tests passed. Frontend lint, strict TypeScript, nine frontend tests and the production build passed. Browser login with the requested credentials succeeded; Bradly Emerson appears in header/sidebar. Twenty-one existing workspace destinations had no document overflow or page alerts at 390/1024px; three authentication pages passed 390/1024/1440/2086px. Browser checks verified menu Tab/Shift+Tab wrap and Escape focus return, native SVG icon rendering, and the blocked-work deep link. Native recovery and sign-in desktop compositions were visually inspected. Full remaining Figma variants are still tracked in FIGMA_SCREEN_MAP.md.

## 2026-09-26 profile, growth and trainer update

Bradley Emerson identity corrected. Expanded self-service profile and private validated photo uploads; daily reminder preference wired to background tasks. Added dedicated invitation acceptance with single-use validation. Added saved growth journals, shared manager capability observations and finalised Review History. Animated corner corporate trainer has server-only OpenAI configuration, private conversations, written guides, retries and honest unavailable states. No key configured.

Validation: all 71 backend tests pass against PostgreSQL; all 11 frontend tests pass; lint, TypeScript, production build and migration drift checks pass. Browser coverage and exclusions are in visual-qa.md. User guide: Beyond_the_Finish_Line_User_Guide.docx. Setup: TRAINER_SETUP.md. Figma was read, not modified. Production readiness remains conditional on the existing deployment acceptance gates.

Management Structure now provides a saved-data reporting tree, unassigned roots, relationship list and links to profile/editing. Directory queries avoid loading photo blobs while building lists and hierarchy; photo access remains authenticated. Seven targeted profile/trainer tests passed after that optimisation.

## 27 September 2026 — company access and platform administration

Implemented platform super-admin approval of company requests, company-HR approval of employee requests, permanent stewardship codes, joining timestamps, role-aware login redirects, company suspension, platform company/people/final-report oversight, pricing estimates and saved quotes. Bradley is a super admin outside tenant reporting structures. Company branding fields and uploaded transparent logos are supported. The supplied logo and robot are in use. Dashboard purpose panels display saved company mission and vision.

Validation: the existing + new 80-test backend suite passed, followed by 11 targeted access tests including two additional report-access/logo-transparency tests (82 distinct backend tests covered). Frontend 11 tests passed. Ruff, ESLint, TypeScript, migration drift and production build passed. Real HTTP registration/approval created three labelled local demo role accounts. Browser sign-in verified HR → HR dashboard, manager → Team home, employee → post-sign-in onboarding, Bradley → platform dashboard. Company settings saved and reloaded. LKR 500,000 calculated for 300 employees. Dashboard/settings/join-request pages had no horizontal overflow at 1440, 1024 and 390 CSS-pixel widths; account at 1440/1024; registration at all three. Platform company details checked at 1024/390. Narrow account recheck did not complete because the locator used the wrong heading; no claim of that check. The trainer opens with supplied artwork and a truthful missing-key state. Saved screenshots: tmp/company-steward-preview.png and tmp/platform-admin-preview.png.

See PLATFORM_ACCESS_GUIDE.md and LOCAL_PREVIEW_LOGINS.md. Local preview only; no public deployment or Figma write. No live OpenAI request, payment processing, external company-registry verification or approval email delivery claimed.
