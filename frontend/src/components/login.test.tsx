// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Login from "./login";
const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), refresh: vi.fn() },
  session: vi.fn(),
  post: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/api", () => ({
  session: mocks.session,
  api: vi.fn(),
  post: mocks.post,
}));
vi.mock("@/components/auth-brand", () => ({
  AuthHero: () => null,
  MobileAuthBrand: () => null,
  EmailIcon: () => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockReset().mockResolvedValue({ authenticated: false });
  mocks.post.mockReset();
});
afterEach(cleanup);
async function submitAdmin() {
  render(<Login admin />);
  await waitFor(() => expect(mocks.session).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Business email"), {
    target: { value: "admin@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Sign in" }).closest("form")!,
  );
}
it("refreshes the admin session before navigating, without any company membership", async () => {
  mocks.session
    .mockResolvedValueOnce({ authenticated: false })
    .mockResolvedValueOnce({
      authenticated: true,
      is_platform_admin: true,
      memberships: [],
      company_id: null,
    });
  mocks.post.mockResolvedValue({ redirect: "/platform" });
  await submitAdmin();
  await waitFor(() =>
    expect(mocks.router.replace).toHaveBeenCalledWith("/platform"),
  );
  expect(mocks.session).toHaveBeenCalledTimes(2);
  expect(mocks.post.mock.calls[0][0]).toBe("auth/admin-login/");
  expect(mocks.router.refresh).toHaveBeenCalled();
});
it("shows an authorization error if a successful login has no admin session", async () => {
  mocks.post.mockResolvedValue({ redirect: "/platform" });
  await submitAdmin();
  expect(
    await screen.findByText(
      "This account does not have Platform Administration access.",
    ),
  ).toBeTruthy();
  expect(mocks.router.replace).not.toHaveBeenCalled();
});
it("redirects an already authenticated admin from admin login", async () => {
  mocks.session.mockResolvedValue({
    authenticated: true,
    is_platform_admin: true,
  });
  render(<Login admin />);
  await waitFor(() =>
    expect(mocks.router.replace).toHaveBeenCalledWith("/platform"),
  );
});
it("does not route an ordinary authenticated user to the admin dashboard", async () => {
  mocks.session.mockResolvedValue({
    authenticated: true,
    is_platform_admin: false,
  });
  render(<Login admin />);
  await waitFor(() => expect(mocks.session).toHaveBeenCalled());
  expect(mocks.router.replace).not.toHaveBeenCalled();
});
it("keeps Chief Steward login on its existing workspace flow", async () => {
  mocks.post.mockResolvedValue({ redirect: "/hr/dashboard" });
  render(<Login />);
  await waitFor(() => expect(mocks.session).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Sign in as"), {
    target: { value: "hr" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Sign in" }).closest("form")!,
  );
  await waitFor(() =>
    expect(mocks.router.replace).toHaveBeenCalledWith("/hr/dashboard"),
  );
  expect(mocks.post.mock.calls[0][0]).toBe("auth/login/");
  expect(mocks.session).toHaveBeenCalledTimes(1);
});
it("offers only Chief Steward and Steward Guy on normal login", () => {
  render(<Login />);
  expect(screen.getByRole("option", { name: "Chief Steward" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Steward Guy" })).toBeTruthy();
  expect(screen.queryByText(/Platform super admin/i)).toBeNull();
});
it("shows the admin identity without roles or registration", () => {
  render(<Login admin backUrl="https://btflplatform.com" />);
  expect(screen.getByText("PLATFORM ADMINISTRATION")).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByText(/Register a company/)).toBeNull();
  expect(
    screen.getByRole("link", { name: "Back to BTFL" }).getAttribute("href"),
  ).toBe("https://btflplatform.com");
});
