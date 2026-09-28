import { describe, it, expect, vi, afterEach } from "vitest";
import { api, post, session, ApiError, errorMessage } from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("API permission and error contract", () => {
  it("preserves actionable field validation", () => {
    expect(errorMessage({ due_date: ["Choose a date."] })).toBe(
      "due_date: Choose a date.",
    );
  });
  it("sends the session CSRF token with mutations", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ authenticated: true, csrf_token: "test-csrf" }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "new-work" })));
    vi.stubGlobal("fetch", fetcher);
    await session();
    await post("tasks/", { title: "A real assignment" });
    expect(fetcher.mock.calls[1][1].headers["X-CSRFToken"]).toBe("test-csrf");
    expect(fetcher.mock.calls[1][1].credentials).toBe("same-origin");
  });
  it("does not turn a forbidden response into successful data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { status: 403, details: "Direct reports only." },
          }),
          { status: 403 },
        ),
      ),
    );
    await expect(api("tasks/")).rejects.toEqual(
      new ApiError(403, "Direct reports only."),
    );
  });
  it("reports stale version without overwriting client input", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { status: 409, details: "Reload the latest version." },
          }),
          { status: 409 },
        ),
      ),
    );
    await expect(
      post("reviews/review-1/employee-reflection/", {
        version: 1,
        content: { outcomes: "Unsaved work" },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
