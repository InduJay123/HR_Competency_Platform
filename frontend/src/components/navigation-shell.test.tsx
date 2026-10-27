// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NavigationShell } from "./navigation-shell";

let resize: (() => void) | undefined;
let mobile = true;
beforeEach(() => {
  mobile = true;
  vi.stubGlobal("matchMedia", () => ({ get matches() { return mobile; }, addEventListener: (_: string, fn: () => void) => { resize = fn; }, removeEventListener: vi.fn() }));
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(role: string) {
  render(<NavigationShell className="workspace" sidebarClassName="sidebar" navigation={<><nav aria-label={role}><a href="#destination">Dashboard</a><button>Companies</button></nav><button>Sign out</button></>}><main>Page content</main></NavigationShell>);
  const trigger = screen.getByRole("button", { name: "Open navigation" });
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("dialog") };
}

describe.each(["Platform Super Admin", "Chief Steward", "Steward Associate"])("%s shared navigation", (role) => {
  it("opens an icon-only accessible drawer, locks background and restores focus", () => {
    const { trigger, dialog } = setup(role);
    const close = within(dialog).getByRole("button", { name: "Close navigation" });
    expect(trigger.textContent).toBe("");
    expect(close.textContent).toBe("");
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(close);
    expect(document.body.style.position).toBe("fixed");
    expect(screen.getByRole("main").parentElement?.hasAttribute("inert")).toBe(true);
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.position).toBe("");
  });
  it.each(["escape", "backdrop", "link", "button", "resize"])("closes on %s", (method) => {
    const { dialog } = setup(role);
    if (method === "escape") fireEvent.keyDown(dialog, { key: "Escape" });
    if (method === "backdrop") fireEvent.click(screen.getByRole("button", { name: "Dismiss navigation" }));
    if (method === "link") fireEvent.click(within(dialog).getByRole("link"));
    if (method === "button") fireEvent.click(within(dialog).getByRole("button", { name: "Companies" }));
    if (method === "resize") { mobile = false; act(() => resize?.()); }
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("traps keyboard focus", () => {
    const { dialog } = setup(role);
    const close = within(dialog).getByRole("button", { name: "Close navigation" });
    const last = within(dialog).getByRole("button", { name: "Sign out" });
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });
});
