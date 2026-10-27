// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { api, allPages, post } from "@/lib/api";
import { Development } from "./development";
import {
  followUpFixture,
  followUpOptions,
  followUpPage,
} from "./development-test-fixtures";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
  allPages: vi.fn(),
  post: vi.fn(),
}));
vi.mock("./shell", () => ({ useSession: () => ({ company_id: "company" }) }));
beforeEach(() => {
  vi.mocked(api).mockImplementation(async (path) =>
    path === "development/filters/"
      ? followUpOptions
      : path.includes("/history/")
        ? []
        : followUpPage,
  );
  vi.mocked(post).mockResolvedValue({});
  vi.mocked(allPages).mockResolvedValue([
    { id: "source", title: "Authorised evidence", validation: "VALIDATED" },
  ]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("identifies the Steward Associate and distinct owner, with status, due date and original links", async () => {
  render(<Development team />);
  expect(await screen.findByText("Alex Steward Associate")).toBeTruthy();
  expect(screen.getByText("Analyst · Finance")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Alex Steward Associate's profile" }),
  ).toBeTruthy();
  expect(
    screen.getByText("Commitment owner: Morgan Chief Steward"),
  ).toBeTruthy();
  expect(screen.getByText(/Overdue · Due/)).toBeTruthy();
  expect(screen.getByText("1 Support needed")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Original agreed record" })
      .getAttribute("href"),
  ).toBe("/employee/reviews/review");
});

it("sends all filters to the server and resets pagination", async () => {
  render(<Development team />);
  await screen.findByText("Alex Steward Associate");
  fireEvent.change(screen.getByLabelText("Steward Associate"), {
    target: { value: "person" },
  });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("development/?page=1&employee=person"),
  );
  fireEvent.change(screen.getAllByLabelText("Status")[0], {
    target: { value: "SUPPORT_NEEDED" },
  });
  fireEvent.change(screen.getByLabelText("Department"), {
    target: { value: "finance" },
  });
  fireEvent.change(screen.getByLabelText("Due"), {
    target: { value: "overdue" },
  });
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "Alex" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "development/?page=1&search=Alex&employee=person&status=SUPPORT_NEEDED&department=finance&due=overdue",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await screen.findByText("Alex Steward Associate");
  expect(
    (screen.getByLabelText("Steward Associate") as HTMLSelectElement).value,
  ).toBe("");
});

it("keeps Next and Previous and uses all-page filtered summary counts", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path === "development/filters/"
      ? followUpOptions
      : {
          ...followUpPage,
          count: 51,
          next: path.includes("page=2") ? null : "next",
          previous: path.includes("page=2") ? "previous" : null,
          summary: { ...followUpPage.summary, total: 51, SUPPORT_NEEDED: 51 },
        },
  );
  render(<Development team />);
  await screen.findByText("51 commitments");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Page 2");
  expect(api).toHaveBeenCalledWith("development/?page=2");
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  await screen.findByText("Page 1");
});

it("preserves status notes evidence save and development-work assignment", async () => {
  render(<Development team />);
  await screen.findByText("Alex Steward Associate");
  const details = screen
    .getByText("Progress history and follow-up")
    .closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await screen.findByText("No follow-up recorded yet.");
  expect(allPages).toHaveBeenCalledWith("evidence/?employee=person");
  fireEvent.change(screen.getAllByLabelText("Status")[1], {
    target: { value: "IN_PROGRESS" },
  });
  fireEvent.change(
    screen.getByLabelText("Progress, evidence or support needed"),
    { target: { value: "Practised the handover" } },
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Authorised evidence/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save progress" }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("development/commitment/progress/", {
      version: 1,
      status: "IN_PROGRESS",
      notes: "Practised the handover",
      evidence_ids: ["source"],
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Assign as development work" }),
  );
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      "development/commitment/create-work/",
      {},
    ),
  );
});

it.each(["none", "person", "status"])(
  "shows the appropriate %s empty state",
  async (mode) => {
    vi.mocked(api).mockImplementation(async (path) =>
      path === "development/filters/"
        ? followUpOptions
        : {
            ...followUpPage,
            count: 0,
            results: [],
            summary: {
              total: 0,
              NOT_STARTED: 0,
              IN_PROGRESS: 0,
              SUPPORT_NEEDED: 0,
              COMPLETE: 0,
            },
          },
    );
    render(<Development team />);
    await screen.findByText("No development commitments are available.");
    if (mode === "person") {
      fireEvent.change(screen.getByLabelText("Steward Associate"), {
        target: { value: "person" },
      });
      expect(
        await screen.findByText(
          "No development commitments are recorded for this Steward Associate.",
        ),
      ).toBeTruthy();
    } else if (mode === "status") {
      fireEvent.change(screen.getAllByLabelText("Status")[0], {
        target: { value: "COMPLETE" },
      });
      expect(
        await screen.findByText("No commitments match these filters."),
      ).toBeTruthy();
    }
  },
);

it("does not request Chief Steward filter options on the personal route", async () => {
  render(<Development />);
  await screen.findByText("Alex Steward Associate");
  expect(api).not.toHaveBeenCalledWith("development/filters/");
  expect(screen.queryByLabelText("Steward Associate")).toBeNull();
});

it("renders stored support text verbatim rather than rewriting it", async () => {
  const support =
    "Chief Steward to help define decision boundaries. A second commitment can come from Context. Pasted text";
  vi.mocked(api).mockImplementation(async (path) =>
    path === "development/filters/"
      ? followUpOptions
      : {
          ...followUpPage,
          results: [{ ...followUpFixture, manager_support: support }],
        },
  );
  render(<Development team />);
  expect(await screen.findByText(support, { exact: false })).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});
