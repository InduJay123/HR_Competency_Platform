# Beyond the Finish Line — developer handoff

27 September 2026 · Saved application: `D:\BTFL Final`

This guide covers both connected portals, the saved demo accounts, local startup and the two AI connections. The source includes the integrations; live OpenAI and n8n calls still require credentials and provider testing. This is a local acceptance build, not a production release certificate.

## 1. Open each platform and sign in

| Portal / role | Name | Login email | Local preview password | Dashboard |
| --- | --- | --- | --- | --- |
| Platform super admin | Bradley Emerson | `admin@gmail.com` | `admin1234` | `http://127.0.0.1:3000/platform` |
| Company Head of HR | Jamie Morgan (demo) | `hr.preview@bfl.example` | `Steward-817da9a821!` | `http://localhost:3000/hr/dashboard` |
| Manager | Alex Morgan (demo) | `manager.preview@bfl.example` | `Steward-817da9a821!` | `http://localhost:3000/manager/dashboard` |
| Employee | Jordan Lee (demo) | `employee.preview@bfl.example` | `Steward-817da9a821!` | `http://localhost:3000/employee/dashboard` |

Use `/auth/login` on the corresponding hostname. Choose **Automatic** or the account's role. Manager and employee accounts may first open onboarding.

The company accounts belong to **Stewardship Preview · Demo**, code **ST0002**. Bradley is the platform operator, outside the company reporting hierarchy. Existing Atlas demo records are retained; no additional login credentials are supplied for those people.

Use `127.0.0.1` for Bradley and `localhost` for the company to keep these two sessions separate. Company roles on the same hostname share a browser session: sign out before switching, or use separate browser profiles/private sessions. The role selector changes routing; it cannot grant a role.

These credentials belong only to the saved local demonstration database. A new empty database will not contain them. Do not deploy these passwords. This guide contains credentials and should be shared privately with the development team.

## 2. Responsibilities and approval journey

| Actor | Responsibility |
| --- | --- |
| Bradley / platform super admin | Review company access requests, approve companies, inspect joining information, pricing and platform reports. |
| Company Head of HR | Administer their company, approve employee requests, manage people, reporting structure and review cycles. |
| Appointed independent Head of HR | Validate authorised review sources, request AI analysis, accept/reject its advice with reasons, record the human assessment and finalise acknowledged reviews. Being HR alone does not grant unrestricted review-narrative access. |
| Manager | Assign work within permitted reporting relationships, review progress and complete manager assessments. |
| Employee | Maintain their profile, request company membership, update assigned work, provide evidence, submit reflection and participate in development. |

Company registration → Bradley approval → company workspace access. Employee registration with a company stewardship code → that company's HR approval → membership and employee code. Codes such as `ST0005` and `ST0005-1` are identifiers, not passwords or permission tokens.

Keep employment joining date separate from the automatic platform joining timestamp. Company branding includes name, tagline, logo, vision and mission. Bradley must not become a company employee merely to display platform administration controls.

Preserve the review journey: work → progress/evidence → Mid-Year forms → HR source validation → optional AI advice → human conversation and commitments → acknowledgements/final record → development follow-through → Year-End review. Senior-management evaluations use the relevant senior review content; AI does not assign employment decisions.

## 3. Repository and services

| Location | Purpose |
| --- | --- |
| `frontend/src/app` | Next.js routes for authentication and both portals |
| `frontend/src/components` | Dashboards, forms, navigation, onboarding and Steward |
| `frontend/src/lib/api.ts` | Same-origin session and CSRF-aware API helper |
| `backend/config/urls.py` | Django REST endpoint registration |
| `backend/apps/accounts`, `companies`, `organisation` | Accounts, approvals, memberships, company branding and hierarchy |
| `backend/apps/tasks`, `evidence`, `reviews`, `development` | Work, authorised sources, appraisal workflow and improvement commitments |
| `backend/apps/ai_coach/trainer.py` | Direct OpenAI trainer chat, prompt, response parsing and ownership checks |
| `backend/apps/ai_coach/schema.py`, `services.py`, `tasks.py` | Formal appraisal prompt/schema, input snapshot, validation and background execution |
| `n8n/workflows/stewardship-coaching.json` | Importable formal appraisal workflow; credentials are not included |
| `backend/tests`, `frontend/src` | Backend tests and frontend tests alongside source |
| `backups/btfl-final-20260927.dump` | Saved database, including demo accounts; previously restore-verified in isolation |

Stack: Next.js/React/TypeScript frontend, Django/DRF backend, PostgreSQL, Redis/Celery and an external n8n instance for formal AI analysis. Next.js proxies `/api/v1/` to Django; browser requests use session cookies and CSRF. Django enforces company, role, object and workflow permissions.

## 4. Start the saved application

Prerequisites: Python 3.12+, Node.js 22+, Docker Desktop with Linux containers. Dependencies and build caches were omitted from the save. The existing private root `.env` was included; do not overwrite it or print its secrets.

**The current preview was running from `D:\BFL` when this folder was saved.** Editing `D:\BTFL Final\.env` will not change that running server. To use this saved copy, stop the old frontend/backend yourself and start from the commands below. Do not run two servers on the same ports.

Prepare dependencies and database:

```powershell
Set-Location 'D:\BTFL Final'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
docker compose up -d db redis
.\.venv\Scripts\python.exe backend/manage.py migrate
Set-Location frontend
npm.cmd ci
npm.cmd run build
```

Terminal 1 — Django:

```powershell
Set-Location 'D:\BTFL Final'
.\.venv\Scripts\python.exe backend/manage.py runserver 127.0.0.1:8000 --noreload
```

Terminal 2 — frontend:

```powershell
Set-Location 'D:\BTFL Final\frontend'
npm.cmd start
```

Local services: frontend `3000`, Django `8000`, PostgreSQL `15433`, Redis `6379`. Keep each session on its chosen hostname. The default frontend proxy targets `http://127.0.0.1:8000`.

On this computer Compose project `bfl` reuses its existing database volume. Migration does not import the saved accounts into an empty database. For migration to a new computer, follow [deployment and recovery](docs/deployment.md), restore the supplied dump into the intended empty database and configure its connection. Never restore over newer customer records. The following only verifies restoration in a temporary database; it does not populate the active database:

```powershell
Set-Location 'D:\BTFL Final'
.\scripts\verify-restore.ps1 -Backup 'D:\BTFL Final\backups\btfl-final-20260927.dump'
```

## 5. Connect Steward, the corporate trainer

**Path:** browser → Django → OpenAI Responses API. Trainer chat does not require n8n, Redis or Celery.

1. Create an approved OpenAI API project and server API key. Select a Responses text model available to that project, with project usage controls.
2. Set the following in the root `.env` of the application you will actually run, or inject them through the server environment/secret manager. Replace the placeholders locally; do not paste secrets into chat or frontend source.
3. Restart Django. No frontend rebuild is needed solely for these server settings. For containers, recreate the affected container after changing its environment configuration.
4. Sign in as one of the company accounts and open Steward. Bradley without company membership is not the account to use for company trainer testing.
5. Send a synthetic question and verify a real reply and saved history. The **Live AI training** label means configuration is present, not that the provider has successfully answered.

```dotenv
OPENAI_API_KEY=REPLACE_WITH_SERVER_PROJECT_KEY
OPENAI_TRAINER_MODEL=REPLACE_WITH_APPROVED_RESPONSES_MODEL_ID
```

Set the trainer model explicitly. An absent `OPENAI_TRAINER_MODEL` falls back to `OPENAI_MODEL`, but a present empty value remains empty. Django loads the project-root `.env` with `override=False`; an existing process environment value takes precedence.

The implementation sends `POST https://api.openai.com/v1/responses` with bearer authentication, `store: false`, coaching instructions, the last 20 messages and the new question. The parser reads completed message `output_text` entries; do not replace it with a Chat Completions `choices[0]` parser. The Responses format and manual conversation context are described in the [official Responses guide](https://developers.openai.com/api/docs/guides/migrate-to-responses).

Successful question/answer pairs are saved in PostgreSQL under the owner's company membership. The trainer does not automatically read profiles, appraisals, evidence files or other users' chats. HR has no general chat-reading endpoint. Provider storage settings do not replace a customer retention policy.

Current limits: 4,000 input characters, 100 messages per conversation, 100 conversations per member, 12 API requests/minute and a 45-second provider read timeout. No live streaming or voice is implemented. Missing configuration returns 503; provider errors return 502; the UI preserves failed drafts and does not fabricate a response.

### Trainer endpoint contract

All endpoints below require an authenticated, authorised company membership. Mutations also require CSRF protection.

| Method and endpoint | Purpose / request |
| --- | --- |
| `GET /api/v1/auth/session/` | Current session and `csrf_token` |
| `GET /api/v1/trainer/status/` | Configuration availability |
| `GET /api/v1/trainer/conversations/` | Owner-scoped conversation list |
| `POST /api/v1/trainer/conversations/` | Create: `{"title":"Delegation practice"}` |
| `GET /api/v1/trainer/conversations/{id}/messages/` | Owner-scoped message history |
| `POST /api/v1/trainer/conversations/{id}/messages/` | Send: `{"content":"Help me plan a clear delegation conversation."}` |

Use the existing helper inside authenticated frontend code; it supplies cookies and the CSRF token:

```typescript
import { post } from "@/lib/api";

const conversation = await post<{ id: string }>(
  "trainer/conversations/", { title: "Delegation practice" }
);
const reply = await post<{ id: string; role: "assistant"; content: string }>(
  `trainer/conversations/${conversation.id}/messages/`,
  { content: "Help me plan a clear delegation conversation." }
);
// Render reply.content as text through the existing chat UI.
```

Do not send an OpenAI API key to the browser or put one in `NEXT_PUBLIC_*`. Changing only the model ID does not support another vendor: the provider URL and parsing are OpenAI-specific.

## 6. Connect formal appraisal AI analysis

**Path:** submitted forms + HR-validated excerpts → Django snapshot → Redis/Celery → authenticated n8n webhook → OpenAI → backend schema/citation checks → Head of HR disposition → saved review.

This is separate from trainer chat. Setting `OPENAI_API_KEY` for Django does not configure the OpenAI credential inside n8n.

1. Import `n8n/workflows/stewardship-coaching.json` into your n8n instance. The supplied workflow is inactive and has no embedded credentials.
2. Create the Header Auth credential **BFL Backend Webhook**: header `X-BFL-Token`, value a cryptographically random secret of at least 32 bytes. Attach it to the Webhook node.
3. Create **OpenAI Server Authorization**: header `Authorization`, value `Bearer <server project API key>`. Attach it to the OpenAI HTTP Request node. These are two different secrets.
4. Publish the workflow and copy its production webhook URL. Configure Django and the worker with the values below; use HTTPS in production.
5. Choose a model available to the project that supports Responses Structured Outputs. The backend sends a strict JSON schema in `text.format`, consistent with [OpenAI's Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
6. Run Redis, a Celery worker and the scheduler. Restart them after settings/code changes. The supplied Compose app profile has a worker but no beat service; provision the scheduler separately for deployment.

```dotenv
OPENAI_MODEL=REPLACE_WITH_APPROVED_STRUCTURED_OUTPUT_MODEL_ID
N8N_WEBHOOK_URL=https://YOUR_N8N_HOST/webhook/YOUR_PUBLISHED_PATH
N8N_WEBHOOK_TOKEN=REPLACE_WITH_MATCHING_RANDOM_WEBHOOK_SECRET
REDIS_URL=redis://127.0.0.1:6379/0
```

Terminal 3 — Windows local worker:

```powershell
Set-Location 'D:\BTFL Final\backend'
..\.venv\Scripts\python.exe -m celery -A config worker --pool=solo --loglevel=warning
```

Terminal 4 — scheduler:

```powershell
Set-Location 'D:\BTFL Final\backend'
..\.venv\Scripts\python.exe -m celery -A config beat --schedule 'D:\BTFL Final\.celerybeat' --pidfile 'D:\BTFL Final\.celerybeat.pid' --loglevel=warning
```

Use Linux workers for production. Run only one scheduler for this schedule. Keep n8n credentials protected and restrict workflow execution-data retention.

The worker posts `{run_id, input_hash, request}` to n8n. Forward the `request` object to Responses. Return the **raw Responses response object** synchronously, including its `status`, `id` and `output`; returning only assistant text breaks the backend parser. Preserve the supplied workflow's response contract.

| Endpoint | Contract |
| --- | --- |
| `GET /api/v1/reviews/{id}/ai-coaching/` | Appointed reviewer sees configuration and analyses |
| `POST /api/v1/reviews/{id}/ai-coaching/` | Request with `{"version": CURRENT_REVIEW_VERSION}`; returns 202 |
| `POST /api/v1/reviews/{id}/ai-decision/` | `{"analysis_id":"UUID","decision":"ACCEPTED","notes":"Human validation rationale"}`; decision may also be `REJECTED` |

Read the current review version; do not hardcode it. Only the appointed independent Head of HR may request analysis after both submissions and required source validation. AI advice contains strengths, gaps, support, questions and limitations. Backend validation rejects unknown source citations, extra rating fields, malformed output, refusals and incomplete responses. HR still validates meaning and records the final human judgement.

Analysis states include `QUEUED`, `RUNNING`, `RETRYING`, `SUCCEEDED`, `FAILED` and `STALE`. Connection/timeout failures have bounded retries. Beat checks every five minutes for jobs abandoned beyond ten minutes and marks them `FAILED / WORKER_INTERRUPTED` for explicit HR retry. It does not automatically issue another paid request. A documented human-only review path remains available during provider outages.

## 7. Extend the AI agent responsibly

For coaching tone and scope, edit `INSTRUCTIONS` in `backend/apps/ai_coach/trainer.py`. For the formal appraisal schema, edit `schema.py` and update validation/tests and prompt version together. Keep formal review authorisation in backend services.

The existing trainer is conversational coaching, not an autonomous agent that changes company records. Company knowledge retrieval, tool calling, voice and streaming are future extensions. If adding them, enforce membership and document-level permissions before retrieval, keep secrets server-side, audit data access and validate every requested action. Require an explicit human action for consequential review or account changes. Never let model output bypass the established HR workflow.

## 8. Verify before customer use

Run code checks after changes, with PostgreSQL available:

```powershell
Set-Location 'D:\BTFL Final'
.\.venv\Scripts\python.exe backend/manage.py test tests --noinput
.\.venv\Scripts\python.exe -m ruff check backend
.\.venv\Scripts\python.exe backend/manage.py makemigrations --check --dry-run
Set-Location frontend
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Manual acceptance checks:

- Sign in to all four roles; confirm company approvals, employee approvals and tenant boundaries. An employee cannot gain HR permissions by changing the URL or dropdown.
- Trainer: valid reply, saved history, account/company isolation, missing key, invalid key/model, timeout and duplicate send. Keep test questions synthetic.
- Appraisal: complete submissions/source validation, successful queued run, HR acceptance/rejection, acknowledgements, immutable final record and development follow-through.
- Appraisal failure cases: malformed JSON, unknown citations, provider refusal, timeout, stale review version and worker interruption. Confirm the human-only path remains usable.
- Check desktop and narrow web layouts, keyboard focus, tooltips, reduced motion and chat open/close behaviour.

| Symptom | Check |
| --- | --- |
| Preview unchanged after configuration | Which project root owns the running server? Restart that Django process. |
| Trainer remains unavailable | Key and model must both be non-empty; check process environment overriding `.env`. |
| Trainer 502 | Provider key/model/project access, network, timeout and completed-response shape. Do not log keys or conversation bodies. |
| 403 / CSRF error | Correct account, approved membership, same hostname, session token and existing API helper. |
| Appraisal stays queued | Redis URL and worker availability; verify scheduler monitoring. |
| Appraisal provider/validation failure | Published n8n webhook, matching secret, n8n OpenAI credential and raw response contract. |
| Demo login absent on another computer | Migrations do not restore accounts; verify the intended database backup was restored. |
| Port already in use | Existing `D:\BFL` frontend/backend may still be running. |

Live OpenAI/n8n integration tests have not been performed without credentials. SMTP and production private storage also require deployment configuration. Before release, replace demo credentials, configure HTTPS, production secrets and storage/email, and verify backups and monitoring using [deployment guidance](docs/deployment.md).

## 9. Further handoff documents

- [Full implementation guide](docs/DEVELOPER_GUIDE.md)
- [API contracts](docs/api.md) and [permissions](docs/permissions.md)
- [Review workflow](docs/review-workflow.md)
- [Trainer setup](docs/TRAINER_SETUP.md) and [appraisal integration](docs/ai.md)
- [Figma screen mapping](docs/FIGMA_SCREEN_MAP.md)
- [Saved package instructions](START%20HERE.md)

Older source documents may refer to `D:\BFL`. For this saved package, use `D:\BTFL Final` and quote paths with spaces. After intentionally updating package files, regenerate `FILE_MANIFEST.csv`; its previous checksums describe the previous saved contents.
