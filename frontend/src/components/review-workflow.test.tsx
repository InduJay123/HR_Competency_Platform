// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api, post } from "@/lib/api";
import type { Review } from "@/lib/reviews";
import { ReviewWorkflow } from "./review-workflow";
import { Coach } from "./review-coach";

const session = vi.hoisted(() => ({ member: "employee-member" }));
vi.mock("@/lib/api", () => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("./shell", () => ({ useSession: () => ({ company_id: "company", memberships: [{ id: session.member, company_id: "company" }] }) }));
const base = {
  id: "review", employee: "employee", manager: "manager", employee_member: "employee-member",
  manager_member: "manager-member", reviewer: "head-hr", employee_name: "Alex", manager_name: "Morgan",
  round: 1, version: 5, state: "SUBMITTED", employee_ack: null, manager_ack: null,
  workflow: { employee_submitted: true, manager_submitted: true, ai_coaching: "Complete",
    conversation_complete: true, commitments_complete: false, confirmations: { round: 1 }, missing: [] },
  commitments: [{ id: "commitment", action: "Existing action", owner_id: "employee", due_date: "2026-12-01", manager_support: "Time", success_measure: "Outcome" }],
} as unknown as Review;
let review: Review;
const saved = vi.fn(async () => {});

beforeEach(() => {
  review = structuredClone(base); session.member = "employee-member";
  vi.mocked(post).mockResolvedValue({});
  vi.mocked(api).mockResolvedValue({ configured: true, analyses: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("blocks employee coaching until manager submission, then uses the existing endpoint", async () => {
  review.workflow!.manager_submitted = false;
  review.workflow!.ai_coaching = "Waiting for manager appraisal";
  const page = render(<Coach review={review} onSaved={saved} />);
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(screen.getByText("Waiting for manager appraisal")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Run AI Coaching" }) as HTMLButtonElement).disabled).toBe(true);
  review = { ...review, workflow: { ...review.workflow!, manager_submitted: true, ai_coaching: "Ready" } };
  page.rerender(<Coach review={review} onSaved={saved} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Run AI Coaching" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Run AI Coaching" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("reviews/review/ai-coaching/", { version: 5 }));
});

it.each(["employee-member", "manager-member", "head-hr"])("renders saved coaching for %s even without a configured provider", async member => {
  session.member = member;
  vi.mocked(api).mockResolvedValue({ configured: false, analyses: [{ id: "old-analysis", round: 1,
    state: "SUCCEEDED", decision: "", created_at: "2026-01-01", output: { strengths: [{
      observation: "Preserved coaching result", question: "What helped?", uncertainty: "Reported", source_ids: [] }],
      gaps: [], support_options: [], limitations: [] } }] });
  render(<Coach review={review} />);
  expect(await screen.findByText("Preserved coaching result")).toBeTruthy();
  if (member !== "employee-member") expect(screen.queryByRole("button", { name: "Run AI Coaching" })).toBeNull();
  if (member !== "head-hr") expect(screen.queryByRole("button", { name: "Accept as coaching input" })).toBeNull();
});

it.each(["employee", "manager"] as const)("confirms only the authenticated %s participation without a target identity", async role => {
  render(<ReviewWorkflow review={review} role={role} hr={false} onSaved={saved} />);
  fireEvent.click(screen.getByRole("button", { name: "Confirm Participation" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("reviews/review/conversation/", { version: 5 }));
});

it("keeps commitments visible but unavailable before both participation confirmations", () => {
  review.workflow!.conversation_complete = false;
  render(<ReviewWorkflow review={review} role="employee" hr={false} onSaved={saved} />);
  expect(screen.getByText("Existing action")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save commitment" })).toBeNull();
  expect((screen.getByRole("button", { name: "Confirm Commitments" }) as HTMLButtonElement).disabled).toBe(true);
});

it("edits the existing shared commitment by ID", async () => {
  render(<ReviewWorkflow review={review} role="manager" hr={false} onSaved={saved} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit commitment" }));
  fireEvent.change(screen.getByLabelText("Action"), { target: { value: "Agreed shared edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Save commitment" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("reviews/review/commitments/", {
    version: 5, commitment_id: "commitment", commitment: { owner: "employee", action: "Agreed shared edit",
      due_date: "2026-12-01", success_measure: "Outcome", manager_support: "Time" },
  }));
});

it("locks the plan once both participants agree", () => {
  review.workflow!.commitments_complete = true;
  review.workflow!.confirmations = { round: 1, employee_commitments: { actor: "employee-member", at: "2026-01-01" }, manager_commitments: { actor: "manager-member", at: "2026-01-01" } };
  render(<ReviewWorkflow review={review} role="employee" hr={false} onSaved={saved} />);
  expect(screen.queryByRole("button", { name: "Edit commitment" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save commitment" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm Commitments" })).toBeNull();
});

it("gives HR visibility without participant controls", () => {
  render(<ReviewWorkflow review={review} role={null} hr onSaved={saved} />);
  expect(screen.getByText("Existing action")).toBeTruthy();
  for (const name of ["Confirm Participation", "Confirm Commitments", "Save commitment", "Edit commitment"])
    expect(screen.queryByRole("button", { name })).toBeNull();
});
