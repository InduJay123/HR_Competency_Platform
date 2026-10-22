import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminOrigin, isAdminHost, isLocalAdminHost } from "@/lib/portal";
import { adminSession } from "@/lib/admin-session";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const incoming = await headers();
  const host = incoming.get("host") || "";
  const local = isLocalAdminHost(host);
  if (!isAdminHost(host) && !local) redirect(adminOrigin);
  const session = await adminSession(incoming);
  if (!session?.authenticated || !session?.is_platform_admin)
    redirect("/admin/login");
  return children;
}
