// Server-side portal configuration. Redirect destinations never come from user input.
export const adminOrigin =
  process.env.ADMIN_FRONTEND_URL || "http://admin.localhost:3000";
export const platformOrigin =
  process.env.FRONTEND_URL || "http://localhost:3000";
export function isAdminHost(host: string) {
  return (
    !isLocalAdminHost(host) &&
    host.toLowerCase().split(":")[0] === new URL(adminOrigin).hostname
  );
}
export function isLocalAdminHost(host: string) {
  const local = ["localhost", "127.0.0.1"];
  return (
    local.includes(host.toLowerCase().split(":")[0]) &&
    (process.env.NODE_ENV === "development" ||
      (local.includes(new URL(platformOrigin).hostname) &&
        [...local, "admin.localhost"].includes(new URL(adminOrigin).hostname)))
  );
}
export function portalRedirect(host: string, path: string): string | null {
  if (isLocalAdminHost(host)) return null;
  if (path === "/admin/login") return new URL("/auth/login", adminOrigin).href;
  if (!isAdminHost(host)) {
    return path === "/platform" || path.startsWith("/platform/")
      ? adminOrigin
      : null;
  }
  if (path === "/") return "/auth/login";
  if (path === "/platform" || path.startsWith("/platform/")) return null;
  if (
    [
      "/auth/login",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/accept-invitation",
    ].includes(path)
  )
    return null;
  return platformOrigin;
}
