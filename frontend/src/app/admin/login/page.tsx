import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Login from "@/components/login";
import { adminOrigin, isLocalAdminHost } from "@/lib/portal";
import { adminSession } from "@/lib/admin-session";

export default async function AdminLoginPage() {
  const incoming = await headers();
  if (!isLocalAdminHost(incoming.get("host") || ""))
    redirect(new URL("/auth/login", adminOrigin).href);
  const session = await adminSession(incoming);
  if (session?.authenticated && session.is_platform_admin)
    redirect("/platform");
  return <Login admin backUrl="/auth/login" />;
}
