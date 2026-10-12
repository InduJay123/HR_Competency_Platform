// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GrowthPage, TeamGrowth } from "./growth";
import { api, allPages } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  allPages: vi.fn(),
  post: vi.fn(),
}));
vi.mock("./shell", () => ({ useSession: () => ({ company_id: "company" }) }));
const manager = {
  id: "manager",
  first_name: "Manager",
  last_name: "One",
  manager_id: null,
};
const employee = {
  id: "employee",
  first_name: "Employee",
  last_name: "One",
  manager_id: "manager",
};
const teammate = {
  id: "teammate",
  first_name: "Employee",
  last_name: "Two",
  manager_id: "manager",
};
let empty = false;
beforeEach(() => {
  empty = false;
  vi.clearAllMocks();
  HTMLDialogElement.prototype.close = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn();
  vi.mocked(allPages).mockResolvedValue([manager, employee, teammate]);
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "auth/profile/") return manager;
    const params = new URLSearchParams(path.split("?")[1]);
    const subject = params.get("subject");
    const records = empty
      ? []
      : [
          {
            id: `${subject}-entry`,
            subject,
            kind: params.get("kind"),
            category: "Mentoring",
            title: `${subject} record`,
            details: "Existing details",
            outcome: "",
            support: "",
            evidence_url: "https://example.com/evidence",
            shared: true,
            archived: false,
            version: 1,
            can_edit: subject === "manager",
            perspective: "SELF",
            owner_name: subject,
            created_at: "2026-10-01",
          },
        ];
    return {
      results: records,
      count: records.length,
      next: null,
      previous: null,
    };
  });
});
afterEach(cleanup);

it.each(["Contributions and Evidence", "Capability Map", "Legacy Tracker"])(
  "loads selected employee's shared %s in team context",
  async (tool) => {
    render(<TeamGrowth initialSubject="employee" />);
    fireEvent.click(
      await screen.findByRole("button", { name: `Open ${tool}` }),
    );
    expect(await screen.findByText("employee record")).toBeTruthy();
    expect(screen.queryByText("manager record")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: /Open linked evidence/ })
        .getAttribute("href"),
    ).toBe("https://example.com/evidence");
    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path]) =>
            path.includes("subject=employee") && path.includes("scope=team"),
        ),
    ).toBe(true);
    if (tool === "Capability Map")
      expect(
        screen.getByRole("button", { name: "Add observation" }),
      ).toBeTruthy();
    else
      expect(
        screen.queryByRole("button", {
          name: /Add contribution|Record contribution/,
        }),
      ).toBeNull();
    fireEvent.change(screen.getByLabelText("Employee"), {
      target: { value: "teammate" },
    });
    expect(screen.queryByText("employee record")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Open ${tool}` }));
    expect(await screen.findByText("teammate record")).toBeTruthy();
  },
);

it("shows an empty state for an employee with no shared records", async () => {
  empty = true;
  render(<TeamGrowth initialSubject="employee" />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Open Contributions and Evidence",
    }),
  );
  expect(
    await screen.findByText(
      "No Growth Tools records have been shared with you yet.",
    ),
  ).toBeTruthy();
});

it.each([undefined, "manager", "unrelated"])(
  "never falls back to the manager's records for selection %s",
  async (initialSubject) => {
    render(<TeamGrowth initialSubject={initialSubject} />);
    await screen.findByText(
      "Select an employee to view their shared Growth Tools.",
    );
    expect(
      vi.mocked(api).mock.calls.some(([path]) => path.startsWith("growth/")),
    ).toBe(false);
    expect(screen.queryByRole("option", { name: "Manager One" })).toBeNull();
  },
);

it("keeps the personal Growth Tools query and editing controls", async () => {
  render(<GrowthPage kind="CONTRIBUTION" />);
  expect(await screen.findByText("manager record")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  await waitFor(() =>
    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path]) =>
            path.includes("subject=manager") && !path.includes("scope=team"),
        ),
    ).toBe(true),
  );
});
