import { beforeEach, expect, it, vi } from "vitest";
import AdminLogin from "./page";
import LoginPage from "../../auth/login/page";
import { adminOrigin } from "@/lib/portal";
const state = vi.hoisted(() => ({ host: "localhost:3000", session: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: state.host }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/admin-session", () => ({ adminSession: state.session }));
vi.mock("@/components/login", () => ({ default: () => null }));
beforeEach(() => {
  state.host = "localhost:3000";
  state.session.mockReset();
});
it("redirects an existing local admin session without requiring a company", async () => {
  state.session.mockResolvedValue({
    authenticated: true,
    is_platform_admin: true,
    memberships: [],
  });
  await expect(AdminLogin()).rejects.toThrow("redirect:/platform");
});
it("renders local admin login after logout", async () => {
  state.session.mockResolvedValue({ authenticated: false });
  expect((await AdminLogin()).props.admin).toBe(true);
});
it("does not send normal users to the dashboard", async () => {
  state.session.mockResolvedValue({
    authenticated: true,
    is_platform_admin: false,
  });
  expect((await AdminLogin()).props.admin).toBe(true);
});
it("redirects an existing session on the production-style admin host", async () => {
  state.host = new URL(adminOrigin).host;
  state.session.mockResolvedValue({
    authenticated: true,
    is_platform_admin: true,
  });
  await expect(LoginPage()).rejects.toThrow("redirect:/platform");
});
it("leaves normal login unchanged without a server admin-session request", async () => {
  expect((await LoginPage()).props.admin).toBe(false);
  expect(state.session).not.toHaveBeenCalled();
});
