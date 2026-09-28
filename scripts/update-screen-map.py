from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
inventory = json.loads((root / "docs/figma-inventory.json").read_text(encoding="utf-8-sig"))
routes = {
    "E00": ("/manager/reviews; /hr/reviews; /hr/approvals", "ReviewList; filtered review list"),
    "E01": ("/{role}/reviews/[id]", "ReviewDetail; review overview"),
    "E02": ("/employee/reviews/[id]", "ReviewForm; employee-reflection draft/submit"),
    "E03": ("/manager/reviews/[id]", "ReviewForm; manager-assessment"),
    "E04": ("/hr/reviews/[id]", "EvidenceValidation; validate/exclude evidence"),
    "E05": ("/hr/reviews/[id]", "Selected source list; sealed forms + validated excerpts"),
    "E06": ("/hr/reviews/[id]", "ReviewCoach; ai-coaching + human decision"),
    "E07": ("/hr/reviews/[id]", "Human assessment; overall/rationale"),
    "E08": ("/hr/reviews/[id]", "Conversation + 3–5 commitments"),
    "E09": ("/employee/reviews/[id]; /manager/reviews/[id]", "Participant acknowledgements"),
    "E10": ("/{role}/reviews/[id]", "Read-only final snapshot + hash"),
    "E11": ("/employee/development; /manager/development", "Commitments; progress/history/evidence/work link"),
    "E12": ("/employee/reviews/[id]/comparison", "Frozen Mid-Year baseline + commitment outcomes"),
    "E13": ("Shared states", "Feedback/Loading; 403/404/409/AI failures"),
    "E14": ("/hr/reviews/[id]", "Revision reason + new round; retained history"),
    "E15": ("/employee/tasks/[id]; /manager/tasks/[id]", "WorkDetail + EvidencePanel"),
    "E16": ("/hr/approvals; /hr/reviews/[id]", "Acknowledgements + appointed HR finalisation"),
    "E17": ("/manager/reviews/[id]", "Senior leadership conditional strategic/support/systems fields"),
}
lines = ["""# Figma → application map

Updated 2026-09-26. [Source Figma file](https://www.figma.com/design/8v8TpRN9X7fmFJuPDMU77t/Beyond-the-Finish-Line). All 28 pages are retained in `figma-inventory.json`. This implementation does not modify Figma.

FINAL evaluation frames supersede earlier workflow boards. Stages are consolidated into authorised review detail pages rather than artificial separate routes. Working functionality does not certify pixel-level design parity.

## Visual evidence

Native design context/screenshots retrieved for E00 (98:2), E02 (98:102), E03 (98:165), guidance/tours (53:424270), tooltip specifications (53:426245) and sign-in frame/form/hero (53:531471, 53:531867, 53:531474). Local Figma hero SVG, Geist and Steward image are in frontend/public. Sign-in controls are semantic and use real authentication. Additional native contexts inspected: Team Home 53:354820, recovery 53:533866, recovery hero/form 53:533872 / 53:534262, and shared wordmark/navigation icons. These assets are stored locally and retain their SVG root dimensions.

Shared shell: 224px sidebar, white canvas, Geist, blue #245DEB, ink #1B2635, muted #667386, border #E3E8F0, 12px cards. Desktop web is primary; narrow layouts collapse navigation and contain table scrolling. No native mobile product is implemented.

## Final evaluation flow

| Frame | Node | Application route | Component / API boundary | Status |
|---|---|---|---|---|"""]
for page in inventory:
    if page["id"] != "92:2":
        continue
    for frame in page["frames"]:
        code = frame["name"][:3]
        if code not in routes:
            continue
        route, component = routes[code]
        state = "Core implemented; detailed visual comparison pending"
        if code in ("E00", "E02", "E03"):
            state = "Native design context inspected; working API"
        if code == "E06":
            state = "Adapter and mocked contract tests; live provider pending"
        lines.append(f'| {frame["name"]} | {frame["id"]} | `{route}` | {component} | {state} |')
lines.append("""
Wireframes on page 104:374 map to the same routes. E02 browser autosave/reload and backend Mid-Year → Year-End/final-record tests passed. E17 mandatory senior fields are tested; exact visual comparison remains.

## Supporting screens

| Source board | Current application | Status / remaining work |
|---|---|---|
| Access 53:533038 | login, password request/reset | Sign-in and recovery use native artwork with fluid layouts; reset shares that layout. Invitations reuse one-time password setup; dedicated invitation layout pending |
| Account 53:336389 | employee/account | Name/photo URL editing; designation/joining date HR-controlled |
| Employee 53:340226 | dashboard/tasks/reviews/development/notifications | Database-backed core; not every original variant reproduced |
| Manager 53:354808 | dashboard/team/tasks/create/reviews/development | Figma shell, navigation assets and support banner applied; real scoped totals; populated-frame comparison pending |
| HR 53:370928 | dashboard/employees/profile/organisation/cycles/settings | Core implemented; advanced hierarchy visualisation pending |
| Growth 53:388598 | Appraisal sections + commitments | Contribution Conversation, Capability Map, Legacy Tracker, Execution Gap embedded; standalone reusable destinations pending |
| Onboarding 53:402900 / 53:427870 | employee/onboarding | Five post-login slides/replay; native-frame parity pending |
| Tours/tooltips 53:424253 | employee/guide + shared tours/tooltips | Three role tours, highlighted controls, Escape/focus return and keyboard tooltips implemented; manager tour and reflection tooltip browser-checked |
| Shared patterns 53:332491 | Button/Card/Badge/Feedback/Loading | Reusable typed components; no Code Connect mapping |
| Technical system 22:98374 | Architecture/database/permissions/AI docs | Boundaries implemented; live service verification pending |
| Earlier mobile exploration 44:221565 | None | Archived reference; responsive web is the scope |

## Remaining design acceptance

Inspect remaining native frames, compare all role screens at Figma dimensions, verify typography/spacing/error states, implement outstanding growth destinations and obtain customer acceptance of content and visuals. Browser QA also covers 21 existing workspace destinations at 390px and 1024px, plus three authentication pages at 390/1024/1440/2086px without document overflow. Menu focus trapping, Escape focus return and the dashboard blocked-work filter were checked. See visual-qa.md for scope and exclusions; this is not pixel-parity or accessibility certification.
""")
(root / "docs/FIGMA_SCREEN_MAP.md").write_text("\n".join(lines), encoding="utf-8")
