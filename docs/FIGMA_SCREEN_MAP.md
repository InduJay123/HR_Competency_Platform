# Figma → application map

Updated 2026-09-26. [Source Figma file](https://www.figma.com/design/8v8TpRN9X7fmFJuPDMU77t/Beyond-the-Finish-Line). All 28 pages are retained in `figma-inventory.json`. This implementation does not modify Figma.

FINAL evaluation frames supersede earlier workflow boards. Stages are consolidated into authorised review detail pages rather than artificial separate routes. Working functionality does not certify pixel-level design parity.

## Visual evidence

Native design context/screenshots retrieved for E00 (98:2), E02 (98:102), E03 (98:165), guidance/tours (53:424270), tooltip specifications (53:426245) and sign-in frame/form/hero (53:531471, 53:531867, 53:531474). Local Figma hero SVG, Geist and Steward image are in frontend/public. Sign-in controls are semantic and use real authentication. Additional native contexts inspected: Team Home 53:354820, recovery 53:533866, recovery hero/form 53:533872 / 53:534262, and shared wordmark/navigation icons. These assets are stored locally and retain their SVG root dimensions.

Shared shell: 224px sidebar, white canvas, Geist, blue #245DEB, ink #1B2635, muted #667386, border #E3E8F0, 12px cards. Desktop web is primary; narrow layouts collapse navigation and contain table scrolling. No native mobile product is implemented.

## Final evaluation flow

| Frame | Node | Application route | Component / API boundary | Status |
|---|---|---|---|---|
| E00 · Reviews I Conduct | 98:2 | `/manager/reviews; /hr/reviews; /hr/approvals` | ReviewList; filtered review list | Native design context inspected; working API |
| E01 · Sarah’s evaluation | 98:52 | `/{role}/reviews/[id]` | ReviewDetail; review overview | Core implemented; detailed visual comparison pending |
| E02 · Formal self-reflection | 98:102 | `/employee/reviews/[id]` | ReviewForm; employee-reflection draft/submit | Native design context inspected; working API |
| E03 · Manager appraisal | 98:165 | `/manager/reviews/[id]` | ReviewForm; manager-assessment | Native design context inspected; working API |
| E04 · Validate the evidence | 98:218 | `/hr/reviews/[id]` | EvidenceValidation; validate/exclude evidence | Core implemented; detailed visual comparison pending |
| E05 · Review sources before analysis | 98:269 | `/hr/reviews/[id]` | Selected source list; sealed forms + validated excerpts | Core implemented; detailed visual comparison pending |
| E06 · AI assistance | 98:316 | `/hr/reviews/[id]` | ReviewCoach; ai-coaching + human decision | Adapter and mocked contract tests; live provider pending |
| E07 · Head of HR assessment | 98:371 | `/hr/reviews/[id]` | Human assessment; overall/rationale | Core implemented; detailed visual comparison pending |
| E08 · Review conversation | 98:422 | `/hr/reviews/[id]` | Conversation + 3–5 commitments | Core implemented; detailed visual comparison pending |
| E09 · Acknowledge your review | 98:471 | `/employee/reviews/[id]; /manager/reviews/[id]` | Participant acknowledgements | Core implemented; detailed visual comparison pending |
| E10 · Final review record | 98:519 | `/{role}/reviews/[id]` | Read-only final snapshot + hash | Core implemented; detailed visual comparison pending |
| E11 · Development follow-up | 99:159 | `/employee/development; /manager/development` | Commitments; progress/history/evidence/work link | Core implemented; detailed visual comparison pending |
| E12 · Mid-Year to Year-End | 99:212 | `/employee/reviews/[id]/comparison` | Frozen Mid-Year baseline + commitment outcomes | Core implemented; detailed visual comparison pending |
| E13 · States and recovery | 99:254 | `Shared states` | Feedback/Loading; 403/404/409/AI failures | Core implemented; detailed visual comparison pending |
| E14 · Request a revision | 99:301 | `/hr/reviews/[id]` | Revision reason + new round; retained history | Core implemented; detailed visual comparison pending |
| E15 · Work outcome and evidence | 99:348 | `/employee/tasks/[id]; /manager/tasks/[id]` | WorkDetail + EvidencePanel | Core implemented; detailed visual comparison pending |
| E16 · Ready for HR finalisation | 99:396 | `/hr/approvals; /hr/reviews/[id]` | Acknowledgements + appointed HR finalisation | Core implemented; detailed visual comparison pending |
| E17 · Senior leader manager appraisal | 113:404 | `/manager/reviews/[id]` | Senior leadership conditional strategic/support/systems fields | Core implemented; detailed visual comparison pending |

Wireframes on page 104:374 map to the same routes. E02 browser autosave/reload and backend Mid-Year → Year-End/final-record tests passed. E17 mandatory senior fields are tested; exact visual comparison remains.

## Supporting screens

| Source board | Current application | Status / remaining work |
|---|---|---|
| Access 53:533038 | login, password request/reset | Sign-in and recovery use native artwork with fluid layouts; reset shares that layout. Dedicated invitation acceptance at `/auth/accept-invitation`, verified one-time token, separate first/last name fields. Native invitation frame 53:336409 inspected. |
| Account 53:336389 | employee/account | Account frame 53:337984 inspected. Personal name, uploaded photo, phone, contact email, designation, employment company, location, skills and bio; joining date and reporting/access stay HR-controlled. |
| Employee 53:340226 | dashboard/tasks/reviews/development/notifications | Database-backed core; not every original variant reproduced |
| Manager 53:354808 | dashboard/team/tasks/create/reviews/development | Figma shell, navigation assets and support banner applied; real scoped totals; populated-frame comparison pending |
| HR 53:370928 | dashboard/employees/profile/organisation/cycles/settings | Core implemented; Management Structure at `/hr/management-structure` adds live reporting map, unassigned and list views. Native frame 53:379738 and structure card 53:380243 inspected. |
| Growth 53:388598 | Appraisal sections + commitments | Standalone saved Contributions and Evidence, Capability Map and Legacy Tracker, plus Growth tools and Review History. Native frames 53:390559 / 53:393083 / 53:395683 and card children inspected. Private/shared journal permissions and manager perspective implemented. |
| Onboarding 53:402900 / 53:427870 | employee/onboarding | Five post-login slides/replay; native-frame parity pending |
| Tours/tooltips 53:424253 | employee/guide + shared tours/tooltips | Three role tours, highlighted controls, Escape/focus return and keyboard tooltips implemented; manager tour and reflection tooltip browser-checked |
| Shared patterns 53:332491 | Button/Card/Badge/Feedback/Loading | Reusable typed components; no Code Connect mapping |
| Technical system 22:98374 | Architecture/database/permissions/AI docs | Boundaries implemented; live service verification pending |
| Earlier mobile exploration 44:221565 | None | Archived reference; responsive web is the scope |

## Remaining design acceptance

Inspect remaining native frames, compare all role screens at Figma dimensions, verify typography/spacing/error states, verify populated data variants and obtain customer acceptance of content and visuals. Browser QA also covers 21 existing workspace destinations at 390px and 1024px, plus three authentication pages at 390/1024/1440/2086px without document overflow. Menu focus trapping, Escape focus return and the dashboard blocked-work filter were checked. See visual-qa.md for scope and exclusions; this is not pixel-parity or accessibility certification.

## Corporate trainer and profile extension

Steward is an original SVG seedling character inspired by the supplied pixel reference, with reduced-motion support. The corner panel is functional in every signed-in context. Server-side Responses API connection, owner-scoped stored chat, unavailable/error states and written learning guides are implemented. No live key was supplied; provider success is tested with mocks only. See TRAINER_SETUP.md. This turn did not write changes into the Figma file.
