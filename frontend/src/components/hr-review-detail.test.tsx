// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { api, post } from "@/lib/api";
import type { Review } from "@/lib/reviews";
import type { Analysis } from "./review-coach";
import { ReviewDetail } from "./review-detail";

vi.mock("@/lib/api", () => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "review-1" }) }));
vi.mock("./shell", () => ({
  useSession: () => ({ company_id: "company-1", memberships: [{ id: "hr-1", company_id: "company-1" }] }),
}));

const baseReview = {
  id: "review-1", employee: "employee-1", employee_member: "employee-member",
  manager: "manager-1", manager_member: "manager-member", reviewer: "hr-1",
  employee_name: "Alex Employee", manager_name: "Morgan Manager",
  state: "SUBMITTED", round: 1, version: 7, employee_ack: null, manager_ack: null,
  cycle_detail: { kind: "MID_YEAR", year: 2026, starts_on: "2026-01-01", ends_on: "2026-06-30", due_on: "2026-07-07" },
  forms: [
    { kind: "EMPLOYEE", submitted_at: "2026-07-01", content: { outcomes: "Original employee reflection" } },
    { kind: "MANAGER", submitted_at: "2026-07-02", content: { overall: "Developing Steward", ecp: "Growers", summary: "Original manager appraisal" } },
  ],
  workflow: { employee_submitted: true, manager_submitted: true, ai_coaching: "Complete",
    conversation_complete: false, commitments_complete: false, confirmations: { round: 1 },
    missing: ["Commitments confirmation", "Manager acknowledgement"] },
  evidence: [], history: [
    { action: "employee.saved", version: 1, created_at: "2026-07-01", reason: "Saved reflection" },
    { action: "employee.submitted", version: 2, created_at: "2026-07-02", reason: "Sealed reflection" },
  ],
} as unknown as Review;
const accepted = {
  id: "analysis-1", round: 1, state: "SUCCEEDED", decision: "ACCEPTED",
  model: "audit-model", prompt_version: "audit-prompt", input_hash: "secret-hash",
  error_code: "", decision_notes: "Human decision note", created_at: "2026-07-02T10:00:00Z",
  reviewed_at: "2026-07-02T11:00:00Z",
  output: {
    strengths: [{ observation: "Accepted observation", question: "What helped?", uncertainty: "Reported claim", source_ids: ["source-uuid"] }],
    gaps: [], support_options: [], limitations: ["Limited source material"],
  },
} as Analysis;
let review: Review;
let analyses: Analysis[];

beforeEach(() => {
  review = structuredClone(baseReview);
  analyses = [structuredClone(accepted)];
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "reviews/review-1/") return review;
    if (path === "reviews/review-1/ai-coaching/") return { configured: true, analyses: [...analyses] };
    throw new Error(`Unexpected API request: ${path}`);
  });
  vi.mocked(post).mockResolvedValue({});
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

async function show() {
  render(<ReviewDetail oversight />);
  await screen.findByText("Steward coaching");
  await waitFor(() => expect(screen.queryByText("Loading coaching status…")).toBeNull());
}
function disclosure(label: RegExp) {
  return screen.getByText(label, { selector: "summary" }).parentElement as HTMLDetailsElement;
}

it("keeps submissions and audit records in closed disclosures and accepted coaching prominent", async () => {
  analyses.push({ ...accepted, id: "failed-1", state: "FAILED", decision: "", error_code: "INTERNAL_FAILURE", output: undefined });
  await show();
  expect(screen.getByText("Review progress")).toBeTruthy();
  expect(disclosure(/^View submission$/).open).toBe(false);
  expect(disclosure(/^View appraisal$/).open).toBe(false);
  expect(within(disclosure(/^View submission$/)).getByText("Original employee reflection")).toBeTruthy();
  expect(within(disclosure(/^View appraisal$/)).getByText("Original manager appraisal")).toBeTruthy();
  const history = disclosure(/^View full history/);
  expect(history.open).toBe(false);
  expect(within(history).getByText("Employee saved")).toBeTruthy();
  expect(within(history).getByText("Employee submitted")).toBeTruthy();
  const aiHistory = disclosure(/^AI history and provenance/);
  expect(aiHistory.open).toBe(false);
  expect(within(aiHistory).getByText("Failed")).toBeTruthy();
  expect(screen.getByText("Accepted by Head of HR").closest("details")).toBeNull();
  for (const element of screen.getAllByText("Accepted observation")) {
    if (!aiHistory.contains(element)) expect(element.closest("details")).toBeNull();
  }
  expect(screen.getByText(/source-uuid/).closest("details")).toBeTruthy();
  expect(screen.queryByText(/secret-hash|INTERNAL_FAILURE/)).toBeNull();
  await waitFor(() => expect(screen.queryByLabelText(/Reason for proceeding without AI/)).toBeNull());
  expect(screen.getAllByText(/No validated evidence was supplied/)).toHaveLength(1);
  history.open = true;
  expect(within(history).getByText("Saved reflection")).toBeTruthy();
});

it("offers HR refresh but keeps generation employee-owned", async () => {
  analyses = [];
  await show();
  expect(screen.queryByRole("button", { name: /Generate coaching|Run AI Coaching/ })).toBeNull();
  const count = vi.mocked(api).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.length).toBeGreaterThan(count));
  expect(api).toHaveBeenCalledWith("reviews/review-1/ai-coaching/");
});

it.each(["ACCEPTED", "REJECTED"])("preserves the %s decision payload", async (decision) => {
  analyses = [{ ...accepted, decision: "", reviewed_at: null }];
  vi.mocked(post).mockImplementation(async () => {
    analyses = [{ ...accepted, decision }];
    return {};
  });
  await show();
  fireEvent.change(screen.getByLabelText("Human review notes"), { target: { value: "Human judgement only" } });
  fireEvent.click(screen.getByRole("button", { name: decision === "ACCEPTED" ? "Accept as coaching input" : "Reject coaching" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("reviews/review-1/ai-decision/", {
    analysis_id: "analysis-1", decision, notes: "Human judgement only",
  }));
  if (decision === "ACCEPTED") {
    expect(await screen.findByText("Accepted by Head of HR")).toBeTruthy();
    expect(screen.queryByLabelText(/Reason for proceeding without AI/)).toBeNull();
  }
});

it("saves human judgement separately and never edits participant commitments", async () => {
  await show();
  const assessment = screen.getByLabelText("Overall assessment") as HTMLSelectElement;
  expect(assessment.value).toBe("");
  fireEvent.change(assessment, { target: { value: "Developing Steward" } });
  fireEvent.change(screen.getByLabelText("Human assessment rationale"), { target: { value: "Human rationale" } });
  fireEvent.click(screen.getByRole("button", { name: "Save human assessment" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("reviews/review-1/human-assessment/", {
    version: 7, assessment: { overall: "Developing Steward", rationale: "Human rationale" },
  }));
  expect(screen.queryByRole("button", { name: "Save commitment" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm Participation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Acknowledge Review" })).toBeNull();
});

it("explains the missing finalisation prerequisites", async () => {
  await show();
  expect(screen.getByText("Cannot finalise review")).toBeTruthy();
  expect(screen.getByText("Manager acknowledgement")).toBeTruthy();
  expect(screen.getByText("Commitments confirmation")).toBeTruthy();
});

it("preserves revision confirmation and its existing payload", async () => {
  await show();
  const revision = disclosure(/^Open revision options$/);
  expect(revision.open).toBe(false);
  revision.open = true;
  fireEvent.change(screen.getByLabelText("Revision reason"), { target: { value: "Clarify outcomes" } });
  fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm Revision" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("reviews/review-1/revision/", { version: 7, reason: "Clarify outcomes" }));
});

it("preserves finalisation gating and confirmation", async () => {
  review = { ...review, state: "ACKNOWLEDGEMENT_PENDING", employee_ack: "2026-07-03", manager_ack: "2026-07-03", workflow: { ...review.workflow!, missing: [] } };
  await show();
  expect(screen.queryByRole("button", { name: "Share for acknowledgement" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Validate and Finalise Review" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm Complete" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("reviews/review-1/complete/", { version: 7, reason: "" }));
});

it("keeps finalisation disabled until both acknowledgements exist", async () => {
  review = { ...review, state: "ACKNOWLEDGEMENT_PENDING", employee_ack: "2026-07-03" };
  await show();
  expect((screen.getByRole("button", { name: "Validate and Finalise Review" }) as HTMLButtonElement).disabled).toBe(true);
});

it("retains evidence validation and labels known sources without showing IDs in primary guidance", async () => {
  review = { ...review, evidence: [{
    id: "source-uuid", title: "Evidence example", kind: "NOTE", note: "Source note", link: "",
    validation: "PENDING", authorised_excerpt: "", validation_reason: "",
  }] };
  await show();
  fireEvent.change(screen.getByLabelText(/Authorised excerpt/), { target: { value: "Approved excerpt" } });
  fireEvent.change(screen.getByLabelText("Validation or exclusion reason"), { target: { value: "Checked source" } });
  fireEvent.click(screen.getByRole("button", { name: "Validate evidence" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("evidence/source-uuid/validate/", {
    validation: "VALIDATED", authorised_excerpt: "Approved excerpt", validation_reason: "Checked source",
  }));
  expect(screen.getAllByText("Source: Validated evidence")[0].closest("details")).toBeNull();
});

it("does not offer appointed HR actions to another member", async () => {
  review = { ...review, reviewer: "different-hr" };
  render(<ReviewDetail oversight />);
  await screen.findByText("Review progress");
  expect(screen.queryByText("Steward coaching")).toBeNull();
  expect(screen.queryByRole("button", { name: "Share for acknowledgement" })).toBeNull();
  expect(screen.queryByText("Open revision options")).toBeNull();
  expect(api).toHaveBeenCalledTimes(1);
});
