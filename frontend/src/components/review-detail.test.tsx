// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { pillarCoaching } from "./coaching-test-fixtures";
import { api } from "@/lib/api";
import { ReviewDetail } from "./review-detail";

vi.mock("@/lib/api", () => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "review-1" }) }));
vi.mock("./shell", () => ({
  useSession: () => ({ company_id: "company-1", memberships: [{ id: "member-1", company_id: "company-1" }] }),
}));
vi.mock("./review-form", () => ({ ReviewForm: () => null }));
vi.mock("./review-coach", () => ({ Coach: () => <div>Shared coaching panel</div> }));

const review = {
  id: "review-1", employee_member: "member-1", employee_name: "Steward Guy",
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
    coaching: pillarCoaching({ strengths: [item], gaps: [], support_options: [], limitations: ["Limited evidence"] }),
    sources: { "raw-source-uuid": "Steward Guy reflection" },
  } : review);
  render(<ReviewDetail showAcceptedCoaching />);
  expect(await screen.findByText("Steward coaching")).toBeTruthy();
  for (const text of ["Supported the team", "Reported claim",
    "Sources: Steward Guy reflection", "Limited evidence",
    "Reviewed by Chief Steward"]) expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getByText("What helped?", { exact: false }).textContent).toBe("Discuss: What helped?");
  for (const pillar of ["Context", "Character", "Capability", "Continuity", "Contribution"])
    expect(screen.getByRole("heading", { name: `${pillar} Coaching` })).toBeTruthy();
  expect(screen.getAllByText("Development focus")).toHaveLength(5);
  expect(screen.getAllByText("Support options")).toHaveLength(5);
  expect(screen.queryByText("raw-source-uuid")).toBeNull();
  expect(screen.getByText("Shared coaching panel")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /generate|refresh|accept|reject/i })).toBeNull();
});

it("does not render a panel when coaching is unavailable", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("accepted-coaching/") ? {
    available: false, coaching: null,
  } : review);
  render(<ReviewDetail showAcceptedCoaching />);
  await screen.findByText("Workflow history");
  await waitFor(() => expect(api).toHaveBeenCalledWith("reviews/review-1/accepted-coaching/"));
  expect(screen.queryByText("Steward coaching")).toBeNull();
});

it("leaves other review page callers unchanged", async () => {
  vi.mocked(api).mockResolvedValue(review);
  render(<ReviewDetail />);
  await screen.findByText("Workflow history");
  expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith("reviews/review-1/");
});

it("shows Mid-Year data as historical reference without a required comparison action", async () => {
  vi.mocked(api).mockResolvedValue({ ...review, midyear_baseline: { commitments: [{ action: "Historical action" }] } });
  render(<ReviewDetail />);
  expect(await screen.findByText("Mid-Year historical reference")).toBeTruthy();
  expect(screen.getByText(/outcomes are not required to submit/)).toBeTruthy();
  expect(screen.queryByText(/Open commitment comparison/)).toBeNull();
  expect(screen.getByText("View the final Mid-Year record")).toBeTruthy();
});
