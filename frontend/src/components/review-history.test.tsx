// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { api } from "@/lib/api";
import { ReviewHistory } from "./review-history";
import { historyFixture } from "./review-history-test-fixtures";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("./shell", () => ({ useSession: () => ({ company_id: "company" }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("loads personal history without a selector, with five human pillar comparisons", async () => {
  vi.mocked(api).mockResolvedValue(historyFixture());
  render(<ReviewHistory />);
  await screen.findByText("Overall progress");
  expect(api).toHaveBeenCalledWith("review-history/?");
  expect(screen.queryByLabelText("Choose a Steward Associate")).toBeNull();
  expect(
    screen.getByText("Changed from Developing Steward to Strong Steward"),
  ).toBeTruthy();
  const section = screen
    .getByRole("heading", { name: "Pillar comparison" })
    .closest("section")!;
  expect(section.querySelectorAll("summary")).toHaveLength(5);
  for (const p of [
    "Context",
    "Character",
    "Capability",
    "Continuity",
    "Contribution",
  ]) {
    const summary = within(section).getByText(p).closest("summary")!;
    expect(summary.parentElement?.tagName).toBe("DETAILS");
    expect((summary.parentElement as HTMLDetailsElement).open).toBe(false);
  }
  expect(
    screen
      .getAllByRole("link", { name: /View final record/ })
      .some((a) => a.getAttribute("href") === "/employee/reviews/MID_YEAR"),
  ).toBe(true);
});

it("requests selected year and retains direct historical record links", async () => {
  vi.mocked(api).mockImplementation(async (path) => ({
    ...historyFixture(),
    selected_year: path.includes("2025") ? 2025 : 2026,
  }));
  render(<ReviewHistory />);
  fireEvent.click(await screen.findByRole("button", { name: "2025" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("review-history/?year=2025"),
  );
  expect(
    (await screen.findByRole("button", { name: "2025" })).getAttribute(
      "aria-pressed",
    ),
  ).toBe("true");
});

it("requires explicit Chief Steward selection before fetching private history", async () => {
  const data = historyFixture();
  vi.mocked(api).mockImplementation(async (path) =>
    path.startsWith("review-history/people/")
      ? { results: [data.person], count: 1, next: null, previous: null }
      : data,
  );
  render(<ReviewHistory chief />);
  expect(
    screen.getByText("Choose a Steward Associate to view review history."),
  ).toBeTruthy();
  const select = await screen.findByLabelText("Choose a Steward Associate");
  expect(
    vi
      .mocked(api)
      .mock.calls.every(([path]) => path.startsWith("review-history/people/")),
  ).toBe(true);
  fireEvent.change(select, { target: { value: "person" } });
  await screen.findByText("Overall progress");
  expect(api).toHaveBeenCalledWith("review-history/?employee_id=person");
  expect(
    screen.getByRole("option", {
      name: "Alex Steward Associate · Analyst · Finance",
    }),
  ).toBeTruthy();
  expect(
    screen
      .getAllByRole("link", { name: /View final record/ })
      .some((a) => a.getAttribute("href") === "/hr/reviews/YEAR_END"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.queryByText("Overall progress")).toBeNull();
});

it.each([true, false])(
  "shows correct empty history state (chief=%s)",
  async (chief) => {
    const data = { ...historyFixture(), available_years: [], history: [] };
    vi.mocked(api).mockImplementation(async (path) =>
      path.startsWith("review-history/people/")
        ? { results: [data.person], count: 1, next: null, previous: null }
        : data,
    );
    render(<ReviewHistory chief={chief} />);
    if (chief)
      fireEvent.change(await screen.findByLabelText("Choose a Steward Associate"), {
        target: { value: "person" },
      });
    expect(
      await screen.findByText(
        chief
          ? "No formal review history is available for this Steward Associate."
          : "No formal review history is available yet.",
      ),
    ).toBeTruthy();
  },
);

it.each(["mid_year", "year_end"] as const)(
  "handles missing %s without a fabricated comparison",
  async (kind) => {
    const data = historyFixture();
    data[kind] = null;
    data.overall_progress = "Not comparable";
    data.available_years = [2026];
    vi.mocked(api).mockResolvedValue(data);
    render(<ReviewHistory />);
    expect(
      await screen.findByText(
        kind === "mid_year"
          ? "Mid-Year review is not available for this year."
          : "Year-End review has not been finalised yet.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Not comparable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "2026" })).toBeNull();
  },
);

it("labels incomplete reviews and separates current commitment tracking from Year-End", async () => {
  const data = historyFixture();
  data.year_end = {
    ...data.year_end!,
    state: "SUBMITTED",
    overall: "",
    summary: "",
    pillars: [],
    finalised_at: null,
  };
  vi.mocked(api).mockResolvedValue(data);
  render(<ReviewHistory />);
  expect(await screen.findByText("Incomplete · Submitted")).toBeTruthy();
  expect(screen.getByText("Human assessment not yet finalised")).toBeTruthy();
  expect(
    screen.getByText("No Year-End outcome recorded for this commitment."),
  ).toBeTruthy();
  expect(screen.getByText("Current tracking status: Complete")).toBeTruthy();
});

it("surfaces server permission errors instead of showing history", async () => {
  vi.mocked(api).mockRejectedValue(
    new Error("You may only view your own review history."),
  );
  render(<ReviewHistory />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "You may only view your own review history.",
  );
  expect(screen.queryByText("Overall progress")).toBeNull();
});
