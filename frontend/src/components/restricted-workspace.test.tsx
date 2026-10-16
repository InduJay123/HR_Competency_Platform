// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RestrictedWorkspace } from "./restricted-workspace";
import type { Session } from "@/lib/types";
import { post } from "@/lib/api";
const navigation = vi.hoisted(() => ({ path: "/hr/billing", replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path, useRouter: () => navigation }));
vi.mock("@/lib/api", () => ({ session: vi.fn().mockResolvedValue({}), post: vi.fn() }));
const data: Session = { authenticated: true, csrf_token: "test", restricted_access: true, suspension_reason: "BILLING_OVERDUE", billing_access: true };
beforeEach(() => { vi.clearAllMocks(); navigation.path = "/hr/billing"; });
afterEach(cleanup);
it("shows a persistent billing explanation and only restricted navigation", () => {
  render(<RestrictedWorkspace data={data}><p>Invoice content</p></RestrictedWorkspace>);
  expect(screen.getByText("Company access temporarily suspended due to outstanding billing.")).toBeTruthy();
  expect(screen.getByText("Invoice content")).toBeTruthy();
  expect(screen.getByRole("link", { name: "My account" }).getAttribute("href")).toBe("/employee/account");
  expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
});
it.each(["/hr/dashboard", "/hr/employees", "/hr/reviews", "/employee/review-history", "/manager/team", "/platform"])("never mounts operational content at %s", (path) => {
  navigation.path = path;
  const mounted = vi.fn();
  function Operational() { mounted(); return <p>Private data</p>; }
  render(<RestrictedWorkspace data={data}><Operational /></RestrictedWorkspace>);
  expect(mounted).not.toHaveBeenCalled();
  expect(navigation.replace).toHaveBeenCalledWith("/hr/billing");
});
it("allows account content", () => {
  navigation.path = "/employee/account";
  render(<RestrictedWorkspace data={data}><p>Account details</p></RestrictedWorkspace>);
  expect(screen.getByText("Account details")).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
});
it("does not claim administrative suspensions are billing related", () => {
  render(<RestrictedWorkspace data={{ ...data, suspension_reason: "ADMIN_SUSPENDED", billing_access: false }}><p>Invoice content</p></RestrictedWorkspace>);
  expect(screen.getByText("Company access is temporarily suspended. Contact the Platform Administrator.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Billing" })).toBeNull();
  expect(screen.queryByText("Invoice content")).toBeNull();
  expect(navigation.replace).toHaveBeenCalledWith("/employee/account");
});
it("retains sign-out access and reports a failed logout", async () => {
  vi.mocked(post).mockRejectedValueOnce(new Error("offline"));
  render(<RestrictedWorkspace data={data}><p>Invoice</p></RestrictedWorkspace>);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("auth/logout/", {}));
  expect(await screen.findByText("Unable to sign out. Please try again.")).toBeTruthy();
});

