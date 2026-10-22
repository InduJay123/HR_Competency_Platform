import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Login from "@/components/login";
import {
  adminOrigin,
  isAdminHost,
  isLocalAdminHost,
  platformOrigin,
} from "@/lib/portal";
import { adminSession } from "@/lib/admin-session";

export default async function AdminLoginPage() {
  const incoming = await headers();
  const host = incoming.get("host") || "";
  if (!isAdminHost(host) && !isLocalAdminHost(host))
    redirect(new URL("/admin/login", adminOrigin).href);
  const session = await adminSession(incoming);
  if (session?.authenticated && session.is_platform_admin)
    redirect("/platform");
  return (
    <Login
      admin
      backUrl={isLocalAdminHost(host) ? "/auth/login" : platformOrigin}
    />
  );
}
