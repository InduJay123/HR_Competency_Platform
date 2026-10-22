import { beforeEach, expect, it, vi } from "vitest";
import Home from "./page";
import AdminLogin from "./admin/login/page";
import { isAdminHost, portalRedirect } from "@/lib/portal";
const state = vi.hoisted(() => ({
  host: "admin.btflplatform.com",
  session: vi.fn(),
}));
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
  state.host = "admin.btflplatform.com";
  state.session.mockReset();
});
it.each([
  "btflplatform.com",
  "www.btflplatform.com",
  "localhost:3000",
  "127.0.0.1:3000",
])("preserves normal root on %s", async (host) => {
  state.host = host;
  expect(portalRedirect(host, "/")).toBeNull();
  await expect(Home()).rejects.toThrow("redirect:/employee/dashboard");
  expect(state.session).not.toHaveBeenCalled();
});
it.each([
  { authenticated: false },
  { authenticated: true, is_platform_admin: false },
  null,
])("sends unauthorized admin root to admin login: %j", async (session) => {
  state.session.mockResolvedValue(session);
  expect(portalRedirect(state.host, "/")).toBeNull();
  await expect(Home()).rejects.toThrow("redirect:/admin/login");
  expect((await AdminLogin()).props.admin).toBe(true);
});
it.each(["admin.btflplatform.com", "ADMIN.BTFLPLATFORM.COM:443"])(
  "recognizes production host without environment configuration: %s",
  async (host) => {
    state.host = host;
    expect(isAdminHost(host)).toBe(true);
    state.session.mockResolvedValue({
      authenticated: true,
      is_platform_admin: true,
    });
    await expect(Home()).rejects.toThrow("redirect:/platform");
    await expect(AdminLogin()).rejects.toThrow("redirect:/platform");
  },
);
it.each(["localhost:3000", "127.0.0.1:3000"])(
  "allows explicit local admin login: %s",
  async (host) => {
    state.host = host;
    expect((await AdminLogin()).props.admin).toBe(true);
  },
);
