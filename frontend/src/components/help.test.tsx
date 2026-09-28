// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Help } from "./help";
afterEach(cleanup);
it("makes contextual help available from the keyboard and dismisses it with Escape", () => {
  render(<Help label="Contribution">Describe impact, with an example.</Help>);
  const trigger = screen.getByRole("button", {name:"Help: Contribution"});
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(trigger);
  const tooltip = screen.getByRole("tooltip");
  expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);
  expect(tooltip.textContent).toContain("impact");
  fireEvent.keyDown(trigger, {key:"Escape"});
  expect(screen.queryByRole("tooltip")).toBeNull();
});
