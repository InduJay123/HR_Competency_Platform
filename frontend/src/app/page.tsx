import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isAdminHost } from "@/lib/portal";
import { adminSession } from "@/lib/admin-session";

export default async function Home() {
  const incoming = await headers();
  if (isAdminHost(incoming.get("host") || "")) {
    const session = await adminSession(incoming);
    redirect(
      session?.authenticated && session.is_platform_admin
        ? "/platform"
        : "/admin/login",
    );
  }
  redirect("/employee/dashboard");
}
