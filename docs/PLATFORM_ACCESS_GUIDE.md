# Platform administration and company access

Updated 27 September 2026. This guide supplements the existing work, review and development user guide.

## Who signs in where

Use /auth/login. Select Automatic or your assigned responsibility: Platform super admin, Company HR administrator, Manager or Employee. The selector never grants a role; the backend verifies it. An approved manager can switch between My Team and My Work. Company HR can switch into their employee workspace.

Bradley Emerson (admin@gmail.com in the local preview) opens /platform. His company memberships have been retired and he is not included in company reporting structures. Old records are retained. The local role accounts and passwords are in LOCAL_PREVIEW_LOGINS.md; do not deploy those credentials.

## A new company joins

1. Open /auth/register and choose Register a company.
2. Enter the Head of HR applicant's identity, business email, phone, designation, company name, nature/industry, country, pricing market, headcount and optional website. Create a password.
3. Submission creates a pending request, not a company membership. The applicant may sign in to /auth/request-status to see progress.
4. Bradley opens Company requests in /platform, reviews the details, verifies the company and the applicant's authority, and records an approval or rejection note. Verification is manual; no external company-registry or email-ownership check is claimed.
5. Approval creates the company and its Head of HR membership in one transaction. The company receives a code such as ST0002; the first member receives ST0002-1. The applicant signs in again to enter the HR workspace.

Rejection grants no workspace access. Duplicate pending requests are rejected. A new request can be submitted after rejection using the existing account password. Decision notes are visible to applicants; include only appropriate verification details.

## An employee joins a company

1. Company HR shares the stewardship code from Company settings.
2. The employee chooses Join my company at /auth/register, enters the code, personal identity, designation and optional employment start date, and submits a request.
3. The company's HR opens Join requests, verifies employment and selects Employee or Manager. Only the Head of HR may grant HR responsibility.
4. Approval creates the membership, permanent employee code and profile. The employee signs in again to enter the workspace. Self-selected job titles never grant access.

Employee codes are sequential within a company, unique, non-recycled and unchanged on deactivation/reactivation. They are identifiers, not passwords. Platform joining time is the approval timestamp; employment joining date remains a separate HR-managed field. Existing migrated memberships use their original creation timestamp as the available platform joining record.

## Company profile and dashboards

Company settings supports name, tagline, industry/nature, country, mission, vision, website, logo URL and uploaded PNG/JPEG logos. Uploads are limited to 2 MB and 10 megapixels, re-encoded as PNG, and preserve alpha transparency. Company logos are publicly accessible branding because they appear on branded sign-in pages. Do not upload a confidential document as a logo.

Name and tagline appear in the workspace header. The dashboard purpose panel shows the larger company name, code, vision and mission. Charts show recorded work and review data; empty workspaces display honest empty states. Company codes and joining timestamps also appear in settings and employee profiles.

The supplied BTFL logo is used on the sign-in, registration, workspace and platform administration screens. The Ask Steward launcher uses the supplied robot image with gentle motion and a reduced-motion alternative. It opens the existing corporate-trainer panel. Written guides work immediately. Live chat requires the server-only OpenAI configuration in TRAINER_SETUP.md; it is never simulated.

## Bradley's company oversight

The platform dashboard shows active companies, pending company requests, active company memberships, finalised stewardship records and market distribution. Companies provides name/code search, company details, employee names and emails, responsibilities, employment start dates, platform joining timestamps and access status.

Final stewardship reports are read-only and audited when opened. This platform surface does not expose private trainer conversations, workshop reflections or unsubmitted review drafts. Report lists are based on saved final snapshots. The separate company Head of HR still owns evidence validation and formal human assessment.

Bradley can suspend/restore a company with a recorded reason. Suspension prevents company API access even for already-signed-in members and preserves records. The platform super-admin role is provisioned server-side; public registration cannot request it.

## Pricing and saved quotes

Source: beyond_pitch_pricing.pdf, supplied by the client, 2026.

| Employees | Sri Lanka (LKR/year) | Regional (USD/year) | Global / Western (USD/year) |
|---|---:|---:|---:|
| 1–50 | 150,000 | 299 | 999 |
| 51–250 | 350,000 | 999 | 2,499 |
| 251–500 | 500,000 | 1,667 | 4,999 |
| 501–1,000 | 750,000 | 2,499 | 7,999 |
| 1,001+ | Custom | Custom | Custom proposal required; no standard tier specified |

Global White Label Partner is a separate USD 15,000/year option. The source's overlapping '1,000+' wording is interpreted as 1,001+ because the Enterprise tier explicitly includes 1,000.

Optional implementation workshop: LKR 500,000 or USD 1,667, one time. Coaching retainer: LKR 450,000 or USD 1,500 per quarter; select zero to four quarters. First-year total = annual licence + workshop + selected coaching quarters. The Book + Tool Bundle (LKR 25,000 / USD 83) is shown as a separate offer whose licence scope needs confirmation, not silently added to an organisation licence.

The source defines no industry/nature price multiplier. The calculator shows that context and lets Bradley enter a negotiated annual amount with a required explanation. Saved headcount cannot be below active company memberships. Quotes persist with source, calculation, note, author and timestamp. They are estimates, not invoices, tax calculations, payments or automatic subscription charges. The pricing document's 'unlimited appraisal cycles' phrase does not override the implemented Mid-Year/Year-End formal workflow.

## Developer notes

- New tables: AccessRequest, CodeSequence, CompanyQuote and PlatformEvent under apps.companies.
- Apply company migrations 0002–0004. Code assignment uses transaction locks; request decisions are single-use with 409 on repeat.
- GET auth/session/ returns is_platform_admin. POST auth/login/ returns a verified redirect. Roles are checked server-side.
- POST auth/register/ is CSRF protected and throttled; GET auth/requests/ is owner scoped.
- access-requests/ and its decide action scope company requests to platform admins and employee requests to the relevant company HR.
- platform/overview/, platform/companies/, platform/pricing/ and platform/reports/:id/ require is_superuser. Never broaden normal tenant endpoints to implement global oversight.
- Company /people/ and /reports/ lists are paginated. Frontend currently loads pages for local directories; add server-driven paging UI for very large tenants.
- Company /quote/ persists calculated estimates; /access/ changes tenant access with an audit event. Repeated quote saves intentionally create separate historical versions.
- Normal company membership remains required for trainer and all work/review APIs. Platform administrators cannot impersonate an employee through these new endpoints.
- promote_platform_admin EMAIL retires tenant memberships without deleting records; it refuses active reporting links or unfinished review participation. Reassign those explicitly first.
- FRONTEND_URL must be the deployed origin for uploaded-logo links and existing invitation links.
- Local PostgreSQL now binds 127.0.0.1:15433 because Windows reserves the previous 5433 port. Redis remains 127.0.0.1:6379. Update DATABASE_URL accordingly.

## Deployment boundary

These changes are implemented in the local app. They have not been deployed to a public domain or pushed into Figma. Before launch, configure production origin/HTTPS, server secrets, OpenAI and mail provider, remove local demo credentials, establish administrator account recovery and validate customer acceptance. There is no payment processor or external registry verification in this release. Approval status is available in-app; this change does not send approval emails.


## Animated Steward and dashboard (27 September 2026)

Steward is now an articulated SVG character, not a raster image. It blinks, floats, waves on hover or keyboard focus, and looks toward a pointer over the character. Chat focus, pending requests, server replies and errors drive its expressions. The existing authenticated trainer endpoints and saved conversations remain in use; an unconfigured OpenAI service continues to show clearly labelled learning guides rather than simulated AI replies.

Company dashboards use animated vector collaboration, checklist and launch scenes, with brief metric-card entrances. These are native SVG/CSS animations with a Lottie-style presentation; no third-party animation runtime, downloaded animation or additional tracking is required. Decorative chart artwork in the hero is illustrative, while the dashboard metrics still come from the reporting API.

Use **Pause motion** in the dashboard illustration or trainer panel to stop decorative animations. This preference persists in the browser and applies across the workspace. Operating-system reduced-motion preferences also disable animations and pointer tracking.

Implementation: `frontend/src/components/steward-bot.tsx`, `workspace-motion.tsx`, and `frontend/src/app/workspace-motion.css`. Automated coverage verifies real request/reply expression changes, provider failure behavior, missing-key behavior and shared motion preferences. Desktop, 1024px and 390px layouts were checked in the local browser.


### Steward visual refinement
The latest launcher is a transparent character only and disappears while chat is open. The header no longer repeats the robot. The hero uses animated glass cards, and real AI requests use the supplied Motion-based ReasoningText indicator. See [Steward motion integration](STEWARD_MOTION_INTEGRATION.md) for implementation and optional Tailwind/shadcn setup.
