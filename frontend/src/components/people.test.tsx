// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { People } from "./people";
import { api, allPages } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  allPages: vi.fn(),
  post: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("uses resolved manager names even when the manager is outside the visible rows", async () => {
  vi.mocked(allPages).mockResolvedValue([]);
  vi.mocked(api).mockResolvedValue({
    count: 3,
    next: null,
    previous: null,
    results: [
      {
        id: "dinaya",
        first_name: "Dinaya",
        last_name: "Nuu",
        manager_id: "abc",
        manager_name: "abc abc",
      },
      {
        id: "xyz",
        first_name: "xyz",
        last_name: "xyz",
        manager_id: "abc",
        manager_name: "abc abc",
      },
      {
        id: "unassigned",
        first_name: "Unassigned",
        last_name: "Person",
        manager_id: null,
        manager_name: "",
        is_head_hr: true,
      },
    ],
  });
  render(<People />);
  const dinaya = await screen.findByRole("row", {
    name: /Dinaya Nuu.*abc abc/,
  });
  expect(
    within(dinaya).getByRole("cell", { name: "abc abc — Chief Steward" }),
  ).toBeTruthy();
  const xyz = screen.getByRole("row", { name: /xyz xyz.*abc abc/ });
  expect(
    within(xyz).getByRole("cell", { name: "abc abc — Chief Steward" }),
  ).toBeTruthy();
  const unassigned = screen.getByRole("row", { name: /Unassigned Person/ });
  expect(
    within(unassigned).getByRole("cell", { name: "No reporting manager" }),
  ).toBeTruthy();
  expect(api).toHaveBeenCalledWith("employees/?page=1&scope=team");
  expect(screen.queryByRole("combobox")).toBeNull();
});
