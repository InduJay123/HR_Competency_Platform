import { describe, expect, it } from "vitest";
import { adminOrigin, platformOrigin, portalRedirect } from "./portal";

describe("portal routing", () => {
  const admin = new URL(adminOrigin).host;
  const normal = new URL(platformOrigin).host;
  it("moves every platform route off the normal host", () => {
    for (const path of [
      "/platform",
      "/platform/billing",
      "/platform/profile",
    ]) {
      expect(portalRedirect("btflplatform.com", path)).toBe(adminOrigin);
      expect(portalRedirect(admin, path)).toBeNull();
    }
  });
  it("allows local admin login and platform routes without changing normal login", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000"])
      for (const path of [
        "/admin/login",
        "/auth/login",
        "/platform",
        "/platform/billing",
      ])
        expect(portalRedirect(host, path)).toBeNull();
    expect(portalRedirect("btflplatform.com", "/admin/login")).toBe(
      new URL("/auth/login", adminOrigin).href,
    );
  });
  it("keeps login, reset, and logout destination on the current portal without loops", () => {
    expect(portalRedirect(admin, "/")).toBe("/auth/login");
    for (const path of [
      "/auth/login",
      "/auth/reset-password",
      "/auth/forgot-password",
    ]) {
      expect(portalRedirect(admin, path)).toBeNull();
      expect(portalRedirect(normal, path)).toBeNull();
    }
  });
  it("keeps onboarding and normal workspaces off the admin host", () => {
    for (const path of [
      "/auth/register",
      "/hr/dashboard",
      "/employee/dashboard",
      "/manager/team",
    ]) {
      expect(portalRedirect(admin, path)).toBe(platformOrigin);
      expect(portalRedirect(normal, path)).toBeNull();
    }
  });
});
