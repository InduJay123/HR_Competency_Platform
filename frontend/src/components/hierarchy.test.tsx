// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { allPages } from "@/lib/api";
import { Hierarchy } from "./hierarchy";

vi.mock("@/lib/api", () => ({ allPages: vi.fn() }));
afterEach(cleanup);

it("renders only Head of HR and one level of employees without assignment controls", async () => {
  vi.mocked(allPages).mockResolvedValue([
    { id: "head", first_name: "Head", last_name: "HR", is_head_hr: true },
    { id: "one", first_name: "Employee", last_name: "One", is_head_hr: false },
    { id: "two", first_name: "Employee", last_name: "Two", is_head_hr: false },
  ]);
  const { container } = render(<Hierarchy />);
  await screen.findByRole("link", { name: /Head HR/ });
  expect(container.querySelectorAll(".hierarchy-tree > li")).toHaveLength(1);
  expect(
    container.querySelectorAll(".hierarchy-tree > li > ul > li"),
  ).toHaveLength(2);
  expect(container.querySelectorAll(".hierarchy-tree ul ul")).toHaveLength(0);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByText("Edit relationships")).toBeNull();
});
