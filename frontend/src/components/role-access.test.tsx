// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { api, post, session } from "@/lib/api";
import Login from "@/app/auth/login/page";
import { Shell } from "./shell";
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/employee/dashboard",
}));
vi.mock("@/lib/api", () => ({ api: vi.fn(), post: vi.fn(), session: vi.fn() }));
vi.mock("./trainer", () => ({ Trainer: () => null }));
vi.mock("./tours", () => ({
  Tours: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./auth-brand", () => ({
  AuthHero: () => null,
  EmailIcon: () => null,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it.each(["employee", "hr", "platform"])(
  "requires an explicit login choice and sends unchanged %s value",
  async (role) => {
    vi.mocked(session).mockResolvedValue({
      authenticated: false,
      csrf_token: "",
    });
    vi.mocked(post).mockResolvedValue({ redirect: "/hr/dashboard" });
    render(<Login />);
    const select = screen.getByRole("combobox", {
      name: "Sign in as",
    }) as HTMLSelectElement;
    expect(select.required).toBe(true);
    expect(select.value).toBe("");
    expect(
      within(select).getByRole("option", { name: "Steward Associate" }),
    ).toBeTruthy();
    expect(
      within(select).getByRole("option", { name: "Chief Steward" }),
    ).toBeTruthy();
    expect(
      within(select).queryByRole("option", {
        name: /automatic|assigned access/i,
      }),
    ).toBeNull();
    fireEvent.change(select, { target: { value: role } });
    fireEvent.submit(select.closest("form")!);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "auth/login/",
        expect.objectContaining({ role }),
      ),
    );
  },
);
it.each([false, true])(
  "uses a static sidebar with navigation and identity (chief=%s)",
  async (chief) => {
    vi.mocked(session).mockResolvedValue({
      authenticated: true,
      csrf_token: "",
      company_id: "c",
      context: chief ? "hr" : "employee",
      contexts: chief
        ? ["employee", "manager", "hr", "approvals"]
        : ["employee", "reviews"],
      user: {
        id: "u",
        first_name: "Alex",
        last_name: "Test",
        email: "alex@example.test",
      },
      memberships: [
        {
          id: "m",
          company_id: "c",
          name: "Company",
          tagline: "",
          logo_url: "",
          contexts: ["employee"],
        },
      ],
    });
    vi.mocked(api).mockResolvedValue({ designation: "Analyst" });
    render(
      <Shell>
        <p>Page content</p>
      </Shell>,
    );
    await screen.findByText("Page content");
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const sidebar = nav.closest("aside")!;
    expect(within(sidebar).queryByRole("combobox")).toBeNull();
    expect(
      within(sidebar).getByText(chief ? "Chief Steward" : "Steward Associate"),
    ).toBeTruthy();
    expect(within(sidebar).getByText("Alex Test")).toBeTruthy();
    expect(
      within(nav).getByRole("link", { name: chief ? "Dashboard" : "My home" }),
    ).toBeTruthy();
    expect(
      within(nav).getByRole("link", { name: "Growth tools" }),
    ).toBeTruthy();
    expect(sidebar.classList.contains("sidebar-steward-guy")).toBe(!chief);
    expect(
      within(sidebar)
        .getByText(chief ? "Chief Steward" : "Steward Associate")
        .classList.contains("identity-role"),
    ).toBe(true);
    if (chief) {
      expect(
        within(nav).queryByRole("link", { name: /team home/i }),
      ).toBeNull();
      expect(within(nav).queryByRole("link", { name: /my team/i })).toBeNull();
      expect(
        within(nav).queryByRole("link", { name: "Reviews I conduct" }),
      ).toBeNull();
      expect(
        within(nav)
          .getByRole("link", { name: "Growth tools" })
          .getAttribute("href"),
      ).toBe("/manager/growth");
      expect(
        within(nav)
          .getByRole("link", { name: "Review oversight" })
          .getAttribute("href"),
      ).toBe("/hr/reviews");
      expect(
        within(nav)
          .getByRole("link", { name: "Team development" })
          .getAttribute("href"),
      ).toBe("/manager/development");
      expect(
        within(nav)
          .getByRole("link", { name: "Team work" })
          .getAttribute("href"),
      ).toBe("/manager/tasks");
    }
  },
);
