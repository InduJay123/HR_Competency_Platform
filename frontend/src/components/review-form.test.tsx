// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ReviewForm } from "./review-form";
import { post, allPages } from "@/lib/api";
import type { Review } from "@/lib/reviews";
import { confirmLeaveDraft } from "@/lib/draft-guard";

vi.mock("@/lib/api", () => ({ post: vi.fn(), allPages: vi.fn() }));
const review = {
  id: "review-1",
  employee: "employee-1",
  employee_name: "Test employee",
  state: "OPEN",
  round: 1,
  version: 4,
  senior_leader: false,
  forms: [],
  cycle_detail: {
    kind: "MID_YEAR",
    year: 2026,
    starts_on: "2026-01-01",
    ends_on: "2026-06-30",
  },
} as unknown as Review;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(allPages).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});
async function show(value = review) {
  await act(async () => {
    render(<ReviewForm review={value} kind="EMPLOYEE" onSubmitted={vi.fn()} />);
  });
}
describe("Reflection draft safety", () => {
  it.each(["EMPLOYEE", "MANAGER"] as const)("autosaves %s draft data without submitting", async (kind) => {
    vi.mocked(post).mockResolvedValue({ ...review, version: 5 });
    await act(async () => {
      render(<ReviewForm review={review} kind={kind} onSubmitted={vi.fn()} />);
    });
    const field = screen.getAllByRole("textbox")[0];
    fireEvent.change(field, { target: { value: "Preserved draft text" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(post).toHaveBeenCalledOnce();
    const [path, payload] = vi.mocked(post).mock.calls[0];
    expect(path).toBe(`reviews/review-1/${kind === "EMPLOYEE" ? "employee-reflection" : "manager-assessment"}/`);
    expect(payload).toMatchObject({ version: 4, submit: false });
    expect(JSON.stringify(payload)).toContain("Preserved draft text");
  });
  it("blocks navigation when the employee chooses to keep unsaved changes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await show();
    fireEvent.change(
      screen.getByRole("textbox", { name: /^Agreed outcomes/ }),
      { target: { value: "Keep this draft" } },
    );
    expect(confirmLeaveDraft()).toBe(false);
    expect(window.confirm).toHaveBeenCalledOnce();
    vi.mocked(window.confirm).mockReturnValue(true);
    expect(confirmLeaveDraft()).toBe(true);
  });
  it("saves edits made while an earlier autosave is in flight using the new version", async () => {
    let finish!: (value: Review) => void;
    vi.mocked(post).mockImplementationOnce(
      () =>
        new Promise<Review>((resolve) => {
          finish = resolve;
        }),
    );
    vi.mocked(post).mockResolvedValueOnce({ ...review, version: 6 });
    await show();
    const field = screen.getByRole("textbox", { name: /^Agreed outcomes/ });
    fireEvent.change(field, { target: { value: "First draft" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(post).toHaveBeenCalledTimes(1);
    fireEvent.change(field, { target: { value: "Newer draft while saving" } });
    await act(async () => {
      finish({ ...review, version: 5 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(post).toHaveBeenCalledTimes(2);
    expect(vi.mocked(post).mock.calls[1][1]).toMatchObject({
      version: 5,
      content: { outcomes: "Newer draft while saving" },
      submit: false,
    });
  });
  it("keeps unsaved text visible and stops background retries after a conflict", async () => {
    vi.mocked(post).mockRejectedValue(
      new Error("This review changed. Reload before saving."),
    );
    await show();
    const field = screen.getByRole("textbox", {
      name: /^Agreed outcomes/,
    }) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Preserve this local draft" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(field.value).toBe("Preserve this local draft");
    expect(screen.getByRole("alert").textContent).toContain("changed");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("renders sealed submissions read-only and never autosaves them", async () => {
    await show({
      ...review,
      forms: [
        {
          kind: "EMPLOYEE",
          round: 1,
          submitted_at: "2026-06-30T12:00:00Z",
          evidence_ids: [],
          content: { outcomes: "Sealed outcome" },
        },
      ],
    });
    const field = screen.getByRole("textbox", {
      name: /^Agreed outcomes/,
    }) as HTMLTextAreaElement;
    expect(field.disabled).toBe(true);
    expect(field.value).toBe("Sealed outcome");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(post).not.toHaveBeenCalled();
  });
});
