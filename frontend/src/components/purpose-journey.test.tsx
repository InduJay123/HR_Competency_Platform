// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PurposeJourney } from "./purpose-journey";
const state = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", () => ({ useReducedMotion: () => state.reduced }));
vi.mock("./workspace-motion", () => ({
  useWorkspaceMotion: () => ({ paused: false, toggle: vi.fn() }),
}));
beforeEach(() => {
  state.reduced = false;
  vi.useFakeTimers();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("cycles the explanatory journey but stops for a chosen human-review step", () => {
  render(<PurposeJourney />);
  expect(
    screen
      .getByRole("button", { name: /Meaningful work/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  act(() => vi.advanceTimersByTime(5600));
  expect(
    screen
      .getByRole("button", { name: /Real evidence/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /Human review/ }));
  expect(screen.getByText(/Head of HR validates/)).toBeTruthy();
  act(() => vi.advanceTimersByTime(16800));
  expect(
    screen
      .getByRole("button", { name: /Human review/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "Play stewardship journey" }),
  );
  act(() => vi.advanceTimersByTime(5600));
  expect(
    screen
      .getByRole("button", { name: /Lasting growth/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
it("keeps reduced-motion users in control without an automatic carousel", () => {
  state.reduced = true;
  render(<PurposeJourney />);
  act(() => vi.advanceTimersByTime(22400));
  expect(
    screen
      .getByRole("button", { name: /Meaningful work/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /Lasting growth/ }));
  expect(
    screen.getByText(/Agree an action, an owner and support/),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Play stewardship journey",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
