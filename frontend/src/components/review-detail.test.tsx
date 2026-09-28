// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { api } from "@/lib/api";
import { ReviewDetail } from "./review-detail";

vi.mock("@/lib/api", () => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "review-1" }) }));
vi.mock("./shell", () => ({
  useSession: () => ({ company_id: "company-1", memberships: [{ id: "member-1", company_id: "company-1" }] }),
}));
vi.mock("./review-form", () => ({ ReviewForm: () => null }));
vi.mock("./review-coach", () => ({ Coach: () => <div>HR coaching controls</div> }));

const review = {
  id: "review-1", employee_member: "member-1", employee_name: "Employee",
  state: "FINALISED", round: 1, version: 1,
  cycle_detail: { kind: "MID_YEAR", year: 2026, due_on: "2026-07-15" },
  forms: [], history: [],
};
const item = {
  observation: "Supported the team", question: "What helped?",
  uncertainty: "Reported claim", source_ids: ["raw-source-uuid"],
};

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("renders accepted guidance with friendly sources and no AI controls", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("accepted-coaching/") ? {
    available: true,
    coaching: { strengths: [item], gaps: [], support_options: [], limitations: ["Limited evidence"] },
    sources: { "raw-source-uuid": "Employee reflection" },
  } : review);
  render(<ReviewDetail showAcceptedCoaching />);
  expect(await screen.findByText("Steward coaching")).toBeTruthy();
  for (const text of ["Supported the team", "Discuss: What helped?", "Reported claim",
    "Sources: Employee reflection", "Areas to discuss", "Support options", "Limited evidence",
    "Reviewed by Head of HR"]) expect(screen.getByText(text)).toBeTruthy();
  expect(screen.queryByText("raw-source-uuid")).toBeNull();
  expect(screen.queryByText("HR coaching controls")).toBeNull();
  expect(screen.queryByRole("button", { name: /generate|refresh|accept|reject/i })).toBeNull();
});

it("does not render a panel when coaching is unavailable", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("accepted-coaching/") ? {
    available: false, coaching: null,
  } : review);
  render(<ReviewDetail showAcceptedCoaching />);
  await screen.findByText("Workflow history");
  expect(api).toHaveBeenCalledWith("reviews/review-1/accepted-coaching/");
  expect(screen.queryByText("Steward coaching")).toBeNull();
});

it("leaves other review page callers unchanged", async () => {
  vi.mocked(api).mockResolvedValue(review);
  render(<ReviewDetail />);
  await screen.findByText("Workflow history");
  expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith("reviews/review-1/");
});
