import { headers } from "next/headers";
import Login from "@/components/login";
import { isAdminHost, platformOrigin } from "@/lib/portal";
import { redirect } from "next/navigation";
import { adminSession } from "@/lib/admin-session";
export default async function LoginPage() {
  const incoming = await headers();
  if (isAdminHost(incoming.get("host") || "")) {
    const session = await adminSession(incoming);
    if (session?.authenticated && session.is_platform_admin)
      redirect("/platform");
  }
  return (
    <Login
      admin={isAdminHost(incoming.get("host") || "")}
      backUrl={platformOrigin}
    />
  );
}
