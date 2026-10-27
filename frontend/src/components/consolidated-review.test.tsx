// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { api } from "@/lib/api";
import { ReviewDetail } from "./review-detail";
import { PILLARS, type Review } from "@/lib/reviews";
vi.mock("@/lib/api", () => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "review" }) }));
const session = vi.hoisted(() => ({ member: "steward" }));
vi.mock("./shell", () => ({ useSession: () => ({ company_id: "company", memberships: [{ id: session.member, company_id: "company" }] }) }));
vi.mock("./review-form", () => ({ ReviewForm: ({ kind }: { kind: string }) => <div>Editable {kind} form</div> }));
vi.mock("./review-coach", () => ({ Coach: () => <div>AI panel</div> }));
function fixture() {
  return {
    id: "review", employee_member: "steward", manager_member: "chief", reviewer: "chief", employee_name: "Alex",
    state: "SUBMITTED", round: 2, version: 4, cycle_detail: { kind: "YEAR_END", year: 2027 },
    pillar_context: PILLARS.map(p => ({ id: p, pillar: p.toUpperCase(), target: `Target ${p}`, success_measure: `Measure ${p}`, notes: `Notes ${p}` })),
    forms: [
      { kind: "EMPLOYEE", round: 2, submitted_at: "2027-12-01", content: { pillars: Object.fromEntries(PILLARS.map(p => [p, `Reflection ${p}`])) } },
      { kind: "MANAGER", round: 2, submitted_at: "2027-12-02", content: { overall: "Strong Steward", summary: "Human summary", pillars: Object.fromEntries(PILLARS.map(p => [p, { narrative: `Appraisal ${p}`, outcome: "Achieved", descriptor: "Strong", evidence_ids: ["internal-id"] }])) } },
    ],
    hr_assessment: { overall: "Strong Steward", rationale: "Human summary" },
    history: [{ action: "employee.submitted", version: 1, created_at: "2027-12-01", reason: '{"pillar_context":"internal audit metadata"}' }],
    submission_history: [{ kind: "EMPLOYEE", round: 1, content: { narrative: "Prior reflection" } }],
  } as unknown as Review;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); session.member = "steward"; });
it.each(["steward", "chief"])("consolidates submitted forms for %s without changing records", async member => {
  session.member = member; const review = fixture(); const before = structuredClone(review);
  vi.mocked(api).mockResolvedValue(review); render(<ReviewDetail />);
  const card = (await screen.findByText("Pillar review")).closest("section")!;
  for (const p of PILLARS) {
    expect(within(card).getByText(`Reflection ${p}`)).toBeTruthy();
    expect(within(card).getByText(`Appraisal ${p}`)).toBeTruthy();
  }
  expect(within(card).getByText("Human summary")).toBeTruthy();
  expect(within(card).getByText("Strong Steward")).toBeTruthy();
  expect(screen.queryByText(/Editable .* form/)).toBeNull();
  expect(screen.queryByText(/submission.*Sealed/)).toBeNull();
  expect(screen.queryByText("Evidence ids")).toBeNull();
  expect(screen.getByText("Prior reflection").closest("details")?.open).toBe(false);
  expect(screen.getByText("Steward Associate submitted")).toBeTruthy();
  expect(screen.queryByText(/internal audit metadata/)).toBeNull();
  expect(review).toEqual(before);
});
it.each(["steward", "chief"])("retains the pending form for %s in a revision", async member => {
  session.member = member; const review = fixture(); review.state = "REVISION_REQUESTED";
  const kind = member === "steward" ? "EMPLOYEE" : "MANAGER";
  review.forms!.find(f => f.kind === kind)!.submitted_at = null;
  vi.mocked(api).mockResolvedValue(review); render(<ReviewDetail />);
  expect(await screen.findByText(`Editable ${kind} form`)).toBeTruthy();
  expect(screen.getAllByText("Awaiting submission")).toHaveLength(5);
  if (kind === "MANAGER") expect(screen.getByText("Awaiting Chief Steward appraisal")).toBeTruthy();
});
it("keeps finalised records readable with one long assessment", async () => {
  const review = fixture(); review.state = "FINALISED";
  vi.mocked(api).mockResolvedValue(review); render(<ReviewDetail />);
  await screen.findByText("Pillar review");
  expect(screen.getAllByText("Human summary", { exact: true })).toHaveLength(1);
  expect(screen.queryByText(/Editable .* form/)).toBeNull();
});

it("preserves a genuinely distinct final human assessment", async () => {
  const review = fixture(); review.state = "FINALISED";
  review.hr_assessment = { overall: "Strong Steward", rationale: "Distinct final rationale" };
  vi.mocked(api).mockResolvedValue(review); render(<ReviewDetail />);
  await screen.findByText("Pillar review");
  expect(screen.getByText("Human summary")).toBeTruthy();
  expect(screen.getByText("Distinct final rationale")).toBeTruthy();
});
