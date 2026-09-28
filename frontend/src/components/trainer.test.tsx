// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Trainer } from "./trainer";
import { WorkspaceMotion, MotionToggle } from "./workspace-motion";
import { api, allPages, post } from "@/lib/api";
vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  allPages: vi.fn(),
  post: vi.fn(),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi
    .fn()
    .mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  vi.mocked(allPages).mockResolvedValue([]);
});
it("offers labelled guides without inventing AI replies when credentials are absent", async () => {
  vi.mocked(api).mockResolvedValue({ available: false });
  render(<Trainer />);
  const launcher = screen.getByRole("button", {
    name: "Open corporate trainer",
  });
  fireEvent.click(launcher);
  await screen.findByText(/Live chat awaits/);
  expect(
    (
      screen.getByRole("button", {
        name: "Send training message",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: /Define a useful outcome/ }),
  );
  expect(screen.getByText(/TRAINING GUIDE · NOT AI GENERATED/)).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(launcher);
});
it("preserves the draft when a configured provider fails and adds no fake assistant reply", async () => {
  vi.mocked(api).mockResolvedValue({ available: true });
  vi.mocked(post)
    .mockResolvedValueOnce({ id: "conversation-1", title: "Delegation" })
    .mockRejectedValueOnce(new Error("Provider unavailable"));
  render(<Trainer />);
  fireEvent.click(
    screen.getByRole("button", { name: "Open corporate trainer" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Message Steward") as HTMLTextAreaElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.change(screen.getByLabelText("Message Steward"), {
    target: { value: "Help me delegate" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Send training message" }),
  );
  await screen.findByText("Provider unavailable");
  expect(
    (screen.getByLabelText("Message Steward") as HTMLTextAreaElement).value,
  ).toBe("Help me delegate");
  expect(screen.getByRole("log").textContent).toBe("");
});

it("reacts to real chat activity and renders the server reply", async () => {
  vi.mocked(api).mockResolvedValue({ available: true });
  let reply!: (value: unknown) => void;
  vi.mocked(post)
    .mockResolvedValueOnce({ id: "c-1", title: "Outcomes" })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    );
  render(<Trainer />);
  fireEvent.click(
    screen.getByRole("button", { name: "Open corporate trainer" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Message Steward") as HTMLTextAreaElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.focus(screen.getByLabelText("Message Steward"));
  expect(
    screen.queryByRole("button", { name: "Open corporate trainer" }),
  ).toBeNull();
  expect(screen.getByRole("dialog").querySelector(".steward-bot")).toBeNull();
  fireEvent.change(screen.getByLabelText("Message Steward"), {
    target: { value: "Help clarify an outcome" },
  });
  fireEvent.blur(screen.getByLabelText("Message Steward"));
  fireEvent.click(
    screen.getByRole("button", { name: "Send training message" }),
  );
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("status").textContent).toContain(
    "Steward is preparing a response",
  );
  reply({
    id: "m-1",
    role: "assistant",
    content: "Agree a measurable outcome and an owner.",
  });
  await screen.findByText("Agree a measurable outcome and an owner.");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("log").textContent).toContain(
    "Help clarify an outcome",
  );
});
it("shares the motion preference across the dashboard and trainer", async () => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(cb, 0),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  const { container } = render(
    <WorkspaceMotion>
      <MotionToggle />
      <Trainer />
    </WorkspaceMotion>,
  );
  await waitFor(() =>
    expect(container.querySelector('[data-motion="playing"]')).toBeTruthy(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Pause decorative animations" }),
  );
  expect(localStorage.getItem("bfl-motion-paused")).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "Open corporate trainer" }),
  );
  await screen.findByRole("dialog");
  expect(
    screen.getAllByRole("button", { name: "Resume decorative animations" }),
  ).toHaveLength(2);
  expect(container.querySelector('[data-motion="paused"]')).toBeTruthy();
  vi.unstubAllGlobals();
});
