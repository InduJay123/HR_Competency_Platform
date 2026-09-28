# API contract

Base path: `/api/v1/`. Django owns authentication and permissions. Next.js uses same-origin `/api` proxying. JSON writes require `X-CSRFToken`; obtain it from `GET auth/session/`. Session cookies are HttpOnly. List endpoints use `{count,next,previous,results}` with page size 50 unless explicitly documented otherwise.

Errors: `{error:{status,details}}`. 400 validation; 403 permission/CSRF; 404 inaccessible object; 409 stale version. Do not convert an error into demo data. Multi-tab forms retain unsaved content on conflict.

| Route | Methods | Purpose |
|---|---|---|
| auth/session | GET | CSRF, identity, memberships, active company and contexts |
| auth/login, logout | POST | Password session sign-in / sign-out |
| auth/context | POST | Select an authorised company and responsibility |
| auth/profile | GET, PATCH | Own identity/photo/onboarding; designation/joining date remain HR-controlled |
| auth/password-reset, set-password | POST | Generic email request and one-time token/password validation |
| companies | GET, POST | Tenant read; platform-admin creation |
| companies/{id} | GET, PATCH | HR company name/tagline/logo settings |
| employees | GET, POST | Authorised people list; HR creates employee |
| employees/{id}/reporting | POST | HR hierarchy change with version |
| employees/{id}/invite | POST | HR access email queue |
| organisation/departments, roles | GET, POST, PATCH detail | Tenant organisation setup |
| tasks, tasks/my-tasks, tasks/team | GET | Paginated work scope |
| tasks | POST | Assign to direct report |
| tasks/{id} | GET, PATCH | Work detail / assigning-manager edits |
| tasks/{id}/updates | GET, POST | Append assignee progress, blockers and result |
| tasks/{id}/delegate | POST | Create child work; parent accountability retained |
| evidence | GET, POST | Private file/note/link evidence, task or employee filters |
| evidence/{id}/download | GET | Authorised private bytes; audited, no-store |
| evidence/{id}/validate | POST | Head of HR validates excerpt or excludes with reason |
| review-cycles | GET, POST | HR two-cycle setup |
| review-cycles/{id}/preview, launch | GET / POST | Readiness and explicit participant/reviewer appointment |
| reviews | GET | Authorised reviews; filters state, employee, manager, cycle, department, overdue, appointed |
| reviews/{id} | GET | Role-filtered forms, evidence, history and shared record |
| reviews/{id}/employee-reflection, manager-assessment | POST | `{version,content,evidence_ids,submit}` |
| reviews/{id}/ai-coaching | GET, POST | Appointed Head of HR status / request; POST version |
| reviews/{id}/ai-decision | POST | `{analysis_id,decision,notes}` advisory disposition |
| reviews/{id}/conversation | POST | Version, discussion, human assessment, 3–5 commitments |
| reviews/{id}/acknowledge | POST | `{version,comments?}`; optional employee-only comments; each participant acknowledges once per round |
| reviews/{id}/complete | POST | `{version}`; appointed Head of HR finalises after both acknowledgements |
| reviews/{id}/revision | POST | Version and mandatory reason, opens a new round |
| reviews/{id}/comparison | GET, POST | Preserved Mid-Year commitments and manager Year-End outcomes |
| development | GET | Finalised commitments in authorised scope |
| development/{id}/progress | POST | Version, notes, status, optional evidence IDs |
| development/{id}/history | GET | Most recent 100 progress events |
| development/{id}/create-work | POST | Reviewing manager creates/returns linked DEVELOPMENT work |
| reports/overview | GET | Real aggregates; scope employee/manager/hr with permission checks |
| reports/reviews.csv | GET | HR status export; optional cycle; formula-safe CSV cells |
| notifications, notifications/{id}/read | GET / POST | Recipient-private inbox |

OpenAPI generation and a stable external-client versioning policy remain release tasks. This table describes the application API, not an unrestricted integration API.
