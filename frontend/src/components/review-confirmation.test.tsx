// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { api, post } from "@/lib/api";
import { ReviewDetail } from "./review-detail";
import type { Review } from "@/lib/reviews";

vi.mock("@/lib/api", () => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "r" }) }));
vi.mock("./shell", () => ({
  useSession: () => ({
    company_id: "c",
    memberships: [{ id: "chief", company_id: "c" }],
  }),
}));
vi.mock("./review-coach", () => ({ Coach: () => null }));
vi.mock("./review-form", () => ({ ReviewForm: () => null }));
vi.mock("./review-workflow", () => ({ ReviewWorkflow: () => null }));

let review: Review;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  review = {
    id: "r",
    employee_member: "employee",
    manager_member: "chief",
    reviewer: "chief",
    employee_name: "Alex",
    state: "ACKNOWLEDGEMENT_PENDING",
    round: 1,
    version: 7,
    employee_ack: "2026-10-16",
    manager_ack: null,
    forms: [],
    history: [],
    hr_assessment: { overall: "Strong Steward", rationale: "Human assessment" },
    cycle_detail: { kind: "MID_YEAR", year: 2026, due_on: "2026-10-16" },
    workflow: {
      commitments_complete: true,
      confirmations: { round: 1 },
      missing: ["Chief Steward acknowledgement"],
    },
  } as unknown as Review;
  vi.mocked(api).mockImplementation(async () => review);
  vi.mocked(post).mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

async function open(label = "Acknowledge Review") {
  render(<ReviewDetail oversight />);
  const trigger = await screen.findByRole("button", { name: label });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

it("opens a single body-level modal with labelled content and no scroll request", async () => {
  const scroll = vi.spyOn(window, "scrollTo");
  const y = window.scrollY;
  await open();
  const dialog = screen.getByRole("dialog", { name: "Confirm action" });
  expect(dialog.parentElement).toBe(document.body);
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(
    document.getElementById(dialog.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Record your acknowledgement of the shared review.");
  expect(
    screen.getAllByRole("heading", { name: "Confirm action" }),
  ).toHaveLength(1);
  expect(dialog.closest("section")).toBeNull();
  expect(document.activeElement).toBe(
    within(dialog).getByRole("button", { name: "Cancel" }),
  );
  expect(window.scrollY).toBe(y);
  expect(scroll).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

it.each(["Cancel", "Escape"])(
  "%s closes without a request and restores focus",
  async (method) => {
    const trigger = await open();
    if (method === "Cancel")
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    else
      fireEvent(
        screen.getByRole("dialog"),
        new Event("cancel", { cancelable: true }),
      );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  },
);

it("confirms once, refreshes persisted acknowledgement, and closes", async () => {
  vi.mocked(post).mockImplementation(async () => {
    review = {
      ...review,
      version: 8,
      manager_ack: "2026-10-16",
      workflow: { ...review.workflow!, missing: [] },
    };
  });
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Confirm Acknowledge" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(post).toHaveBeenCalledExactlyOnceWith("reviews/r/acknowledge/", {
    version: 7,
    reason: "",
  });
  expect(api).toHaveBeenCalledTimes(2);
  expect(
    screen.queryByRole("button", { name: "Acknowledge Review" }),
  ).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Validate and Finalise Review",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(screen.getByText("Your acknowledgement is recorded.")).toBeTruthy();
});

it("keeps failed requests open with a visible error and permits retry", async () => {
  vi.mocked(post).mockRejectedValueOnce(
    new Error("Acknowledgement could not be saved."),
  );
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Confirm Acknowledge" }));
  expect(
    await within(screen.getByRole("dialog")).findByRole("alert"),
  ).toHaveProperty("textContent", "Acknowledgement could not be saved.");
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Confirm Acknowledge" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(post).toHaveBeenCalledTimes(2);
});

it("prevents duplicate confirms and dismissal during a pending request", async () => {
  let resolve!: () => void;
  vi.mocked(post).mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  await open();
  const confirm = screen.getByRole("button", { name: "Confirm Acknowledge" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(post).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  resolve();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("keeps finalisation disabled for missing requirements", async () => {
  render(<ReviewDetail oversight />);
  const button = await screen.findByRole("button", {
    name: "Validate and Finalise Review",
  });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(post).not.toHaveBeenCalled();
});

it("finalises through the same dialog and existing endpoint, retaining backend errors", async () => {
  review = {
    ...review,
    manager_ack: "2026-10-16",
    workflow: { ...review.workflow!, missing: [] },
  };
  vi.mocked(post).mockRejectedValueOnce(
    new Error("Required commitments are incomplete."),
  );
  await open("Validate and Finalise Review");
  const dialog = screen.getByRole("dialog", { name: "Finalise review" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm Finalisation" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveProperty(
    "textContent",
    "Required commitments are incomplete.",
  );
  expect(post).toHaveBeenCalledWith("reviews/r/complete/", {
    version: 7,
    reason: "",
  });
  vi.mocked(post).mockImplementation(async () => {
    review = { ...review, state: "FINALISED", version: 8 };
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm Finalisation" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Final record saved and sealed.")).toBeTruthy();
});
