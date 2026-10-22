// Server-side portal configuration. Redirect destinations never come from user input.
export const adminOrigin =
  process.env.ADMIN_FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://admin.btflplatform.com"
    : "http://admin.localhost:3000");
export const platformOrigin =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://btflplatform.com"
    : "http://localhost:3000");
export function isAdminHost(host: string) {
  return (
    !isLocalAdminHost(host) &&
    ["admin.btflplatform.com", new URL(adminOrigin).hostname].includes(
      host.toLowerCase().split(":")[0],
    )
  );
}
export function isLocalAdminHost(host: string) {
  return ["localhost", "127.0.0.1"].includes(host.toLowerCase().split(":")[0]);
}
export function portalRedirect(host: string, path: string): string | null {
  if (isLocalAdminHost(host)) return null;
  if (!isAdminHost(host)) {
    if (path === "/admin/login")
      return new URL("/admin/login", adminOrigin).href;
    return path === "/platform" || path.startsWith("/platform/")
      ? adminOrigin
      : null;
  }
  // The root page checks the session at request time.
  if (path === "/" || path === "/admin/login") return null;
  if (path === "/auth/login") return "/admin/login";
  if (path === "/platform" || path.startsWith("/platform/")) return null;
  if (
    [
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/accept-invitation",
    ].includes(path)
  )
    return null;
  return platformOrigin;
}
