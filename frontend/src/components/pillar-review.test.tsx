// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { allPages, post } from "@/lib/api";
import { PILLARS, type Review, type PillarTarget, type Cycle } from "@/lib/reviews";
import { TargetSetup } from "./pillar-targets";
import { ReviewForm } from "./review-form";
import { PillarReview } from "./pillar-review";

vi.mock("@/lib/api", () => ({ allPages: vi.fn(), post: vi.fn() }));
const cycle = { id: "cycle", workflow_version: 2, kind: "MID_YEAR", year: 2027, starts_on: "2027-01-01", ends_on: "2027-06-30" } as Cycle;
const targets = PILLARS.map(p => ({ id: p, pillar: p.toUpperCase(), cycle: "cycle", cycle_name: "Mid-Year 2027",
  employee: "employee", target: `Target ${p}`, success_measure: `Measure ${p}`, notes: "", version: 1, completed_at: null })) as PillarTarget[];
const review = { id: "review", version: 1, round: 1, state: "OPEN", employee: "employee", employee_name: "Alex",
  cycle_detail: cycle, forms: [], pillar_context: targets } as unknown as Review;
beforeEach(() => { vi.mocked(allPages).mockResolvedValue([]); vi.mocked(post).mockResolvedValue(targets); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("sets five individual targets and sends explicit completion and versions", async () => {
  vi.mocked(allPages).mockResolvedValue(targets);
  render(<TargetSetup cycle={cycle} people={[{ id: "employee", name: "Alex", has_manager: true }]} onSaved={async () => {}} />);
  fireEvent.change(screen.getByLabelText("Steward Guy"), { target: { value: "employee" } });
  expect(await screen.findByDisplayValue("Target context")).toBeTruthy();
  expect(screen.getAllByRole("textbox")).toHaveLength(15);
  fireEvent.change(screen.getByDisplayValue("Target context"), { target: { value: "Individual coordination target" } });
  fireEvent.click(screen.getByRole("button", { name: "Complete target setup" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("review-cycles/cycle/targets/", expect.objectContaining({
    employee: "employee", complete: true, targets: expect.arrayContaining([expect.objectContaining({ pillar: "CONTEXT", target: "Individual coordination target", version: 1 })]),
  })));
});

it("renders new reflection around target and success measure without legacy generic questions", async () => {
  render(<ReviewForm review={review} kind="EMPLOYEE" onSubmitted={() => {}} />);
  expect(screen.getByText("Target context")).toBeTruthy();
  expect(screen.getByText("Measure contribution")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: /^Agreed outcomes/ })).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(5);
  await waitFor(() => expect(allPages).toHaveBeenCalled());
});

it("shows reflection, outcomes and canonical Steward judgements in Head appraisal", async () => {
  render(<ReviewForm review={{ ...review, forms: [{ kind: "EMPLOYEE", round: 1, content: { pillars: { context: "Coordinated early" } }, submitted_at: "2027-06-30", evidence_ids: [] }] }} kind="MANAGER" onSubmitted={() => {}} />);
  expect(screen.getByText("Coordinated early")).toBeTruthy();
  expect(screen.getAllByLabelText(/Outcome against target/)).toHaveLength(5);
  expect(screen.getAllByLabelText("Steward pillar judgement")).toHaveLength(5);
  expect(screen.queryByLabelText("Human ECP assessment")).toBeNull();
  expect(screen.getByLabelText(/Overall Steward assessment rationale/)).toBeTruthy();
  await waitFor(() => expect(allPages).toHaveBeenCalled());
});

it("final records show pillar details without Growth Tools evidence", () => {
  render(<PillarReview review={{ ...review, state: "FINALISED" }} />);
  expect(screen.getByText("Pillar review")).toBeTruthy();
  expect(screen.getByText("Target context")).toBeTruthy();
  expect(screen.queryByText("Linked Growth Tools evidence")).toBeNull();
  expect(screen.queryByText("No shared linked evidence was captured.")).toBeNull();
});
