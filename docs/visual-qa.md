# Responsive and visual QA — 26 September 2026

The primary product is a desktop web platform. Narrow browser layouts are supported through responsive navigation and contained tables, not a separate mobile application.

## Checked in the browser

Twenty-one existing workspace destinations were loaded at widths 390px and 1024px. Each had a document width no greater than the viewport and no displayed page error:

- HR: overview, people directory, departments/roles, company settings, reviews, review cycles, approvals.
- Manager: team home, work, team, reviews, development, assignment form.
- Employee: home, work, reviews, development, actions/notifications.
- Shared: guide, onboarding, account settings.

Sign-in, password recovery and password setup were checked at 390px, 1024px, 1440px and 2086px. No horizontal overflow; form widths remained usable. At large desktop dimensions the hero scales with viewport height and retains its aspect ratio. Below 820px the form remains visible while the decorative hero is hidden. White backgrounds and blue accents remain consistent.

Native Figma sign-in and recovery frames and Team Home were inspected. Original Figma SVG hero, wordmark and navigation assets are used, with semantic HTML controls and real data rather than screenshot forms. At 1440px the shell uses a 224px sidebar and 80px header. The recovery composition was visually checked in the browser.

Interactions checked: requested local administrator sign-in; role switching; profile name in shell; menu focus on opening, Tab/Shift+Tab wrapping, Escape dismissal and focus return; dashboard blocker link selecting BLOCKED. Icon resources loaded at their declared native dimensions. No password-reset email or new password was submitted during layout QA.

## Limits of this pass

Overflow checks do not establish complete visual parity. Several screens showed legitimate empty states for the new administrator, who has no assigned work or appointed evaluations. Dynamic evaluation details, populated data variants, all error states, standalone growth destinations and exact per-frame visual acceptance remain listed in FIGMA_SCREEN_MAP.md. This pass does not certify all 38 proposed destinations as complete or the platform as production-ready.

Build validation: frontend lint, strict TypeScript, 9 frontend tests and 33-route Next.js production build passed. The 3 new local preview-account tests passed separately from the previously recorded 55 backend tests.

## Profile and corporate trainer pass on 2026-09-26

- 26 main workspace destinations checked after loading at 390, 1024 and 1440 pixels: 78 checks, no document-level horizontal overflow or visible error alerts. Raw records: `tmp/layout-qa.json`.
- Four access pages checked at the same widths: 12 checks without document overflow. Invitation browser check used the invalid/missing-token state; valid acceptance and replay rejection are tested on the backend.
- Profile saved successfully as Bradley Emerson. Sidebar/header identity refreshed. Unknown phone, company profile and joining date were not fabricated.
- Trainer opens from the corner, displays honest missing-configuration guidance, opens written lessons, closes with Escape and returns focus. Corrected a 3px left overflow caused by scrollbar width; final 390px dialog bounds are left 12 / right 363 within 375px content width.
- New growth dialog checked at 390px: left 17 / right 358; form stays within viewport and Escape closes it.
- UI screenshot: `tmp/profile-trainer-preview.png`. User guide rendered as seven pages, each visually inspected. No live OpenAI request was performed.
- These checks cover current seeded/empty views, not all populated review stages, every browser, or full pixel-level Figma parity. Remaining detailed frame comparisons and customer workflow acceptance remain in FIGMA_SCREEN_MAP.md and deployment.md.

Management Structure was subsequently checked in Reporting map, Unassigned and List view at 390/1024/1440px (nine checks, no page overflow). A live hierarchy card opens the matching employee profile. Total main destinations checked: 27. The duplicate old onboarding mascot was removed so Steward is consistently the corner assistant.
