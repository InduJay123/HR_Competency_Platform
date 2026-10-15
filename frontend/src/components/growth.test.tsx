// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GrowthHub, GrowthPage, TeamGrowth } from "./growth";
import { api, allPages, post } from "@/lib/api";
const role = vi.hoisted(() => ({ chief: true }));
vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  allPages: vi.fn(),
  post: vi.fn(),
}));
vi.mock("./shell", () => ({
  useSession: () => ({
    company_id: "company",
    contexts: role.chief ? ["employee", "manager", "hr"] : ["employee"],
  }),
}));
const entry = {
  id: "entry",
  subject: "steward",
  subject_name: "Dinaya Nuu",
  subject_designation: "Assistant Manager",
  kind: "CONTRIBUTION",
  category: "Mentoring",
  title: "Handover coaching",
  details: "Helped a colleague",
  outcome: "Better handovers",
  support: "Practice",
  evidence_url: "https://example.test/evidence",
  shared: true,
  archived: false,
  version: 1,
  can_edit: true,
  perspective: "SELF",
  owner_name: "Dinaya Nuu",
  created_at: "2026-10-01",
};
const person = {
  id: "steward",
  first_name: "Dinaya",
  last_name: "Nuu",
  manager_id: "chief",
};
beforeEach(() => {
  role.chief = true;
  vi.resetAllMocks();
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  vi.mocked(allPages).mockResolvedValue([entry]);
  vi.mocked(api).mockImplementation(async (path) =>
    path === "auth/profile/" ? person : { results: [entry], count: 1 },
  );
});
afterEach(cleanup);

it("shows attributed shared entries, search and filters without any write controls", async () => {
  vi.mocked(allPages).mockResolvedValue([
    entry,
    {
      ...entry,
      id: "second",
      subject: "second",
      subject_name: "Alex Test",
      title: "Knowledge sharing",
    },
    { ...entry, id: "private", shared: false, title: "Private secret" },
  ]);
  render(<TeamGrowth />);
  expect(await screen.findByText("Handover coaching")).toBeTruthy();
  expect(screen.getByText("Dinaya Nuu")).toBeTruthy();
  expect(screen.getAllByText("Assistant Manager").length).toBe(2);
  expect(screen.getByText("Alex Test")).toBeTruthy();
  expect(screen.queryByText("Private secret")).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: /add|create|edit|archive|delete|record contribution/i,
    }),
  ).toBeNull();
  expect(allPages).toHaveBeenCalledWith("growth/?scope=team");
  fireEvent.change(screen.getByLabelText("Search Steward Guys"), {
    target: { value: "dinaya" },
  });
  expect(screen.queryByText("Alex Test")).toBeNull();
  expect(screen.getByText("Handover coaching")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Growth area"), {
    target: { value: "LEGACY" },
  });
  expect(screen.getByText("No matching entries")).toBeTruthy();
});

it("shows a useful empty state", async () => {
  vi.mocked(allPages).mockResolvedValue([]);
  render(<TeamGrowth />);
  expect(
    await screen.findByText("No Growth Tools have been shared with you yet."),
  ).toBeTruthy();
});

it("preserves subject bookmarks without falling back to personal entries", async () => {
  render(<TeamGrowth initialSubject="steward" />);
  await screen.findByText("Handover coaching");
  expect(allPages).toHaveBeenCalledWith("growth/?scope=team&subject=steward");
  expect(
    screen
      .getByRole("link", { name: "View all Steward Guys" })
      .getAttribute("href"),
  ).toBe("/manager/growth");
});

it.each(["hub", "CONTRIBUTION", "CAPABILITY", "LEGACY"])(
  "Chief opening personal %s gets the read-only workspace",
  async (kind) => {
    render(
      kind === "hub" ? (
        <GrowthHub />
      ) : (
        <GrowthPage kind={kind as "CONTRIBUTION" | "CAPABILITY" | "LEGACY"} />
      ),
    );
    await screen.findByText(
      "Shared development activity from your Steward Guys.",
    );
    expect(
      screen.queryByRole("button", {
        name: /add|create|edit|archive|record contribution/i,
      }),
    ).toBeNull();
    expect(api).not.toHaveBeenCalled();
  },
);

it("Steward Guy can create with explicit sharing and see private/shared badges", async () => {
  role.chief = false;
  vi.mocked(allPages).mockResolvedValue([person]);
  vi.mocked(api).mockImplementation(async (path) =>
    path === "auth/profile/"
      ? person
      : {
          results: [
            entry,
            {
              ...entry,
              id: "private",
              shared: false,
              title: "My private reflection",
            },
          ],
          count: 2,
        },
  );
  vi.mocked(post).mockResolvedValue(entry);
  render(<GrowthPage kind="CONTRIBUTION" />);
  await screen.findByText("Handover coaching");
  expect(screen.getByText(/Shared with Chief Steward/)).toBeTruthy();
  expect(screen.getByText(/Private/)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Add contribution" }));
  const visibility = screen.getByLabelText(
    "Share with Chief Steward",
  ) as HTMLInputElement;
  expect(visibility.checked).toBe(false);
  fireEvent.click(visibility);
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "New contribution" },
  });
  fireEvent.change(screen.getByLabelText("Your contribution and evidence"), {
    target: { value: "My work" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save record" }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      "growth/",
      expect.objectContaining({
        shared: true,
        subject: "steward",
        title: "New contribution",
      }),
    ),
  );
});
