// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { api } from "@/lib/api";
import { Comparison } from "./comparison";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "review-1" }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("renders preserved commitments and outcomes as read-only history", async () => {
  vi.mocked(api).mockResolvedValue({
    baseline: [{ id: "old", action: "Prior action", success_measure: "Prior measure", manager_support: "Support", due_date: "2026-06-01" }],
    outcomes: { old: { outcome: "PARTIALLY_MET", rationale: "Historical assessment" } },
  });
  render(<Comparison />);
  expect(await screen.findByText("Prior action")).toBeTruthy();
  expect(screen.getByText("Historical assessment")).toBeTruthy();
  expect(screen.getByText(/outcomes are not required to submit/)).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  expect(api).toHaveBeenCalledWith("reviews/review-1/comparison/");
});
