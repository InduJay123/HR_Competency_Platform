"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@/lib/types";
import { post, session } from "@/lib/api";
import { Brand } from "./brand"; import { NavigationShell } from "./navigation-shell";
import { Button, Feedback } from "./ui";

export function RestrictedWorkspace({
  data,
  children,
}: {
  data: Session;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [error, setError] = useState("");
  const billing =
    data.authenticated && data.restricted_access &&
    (data.allowed_areas?.includes("billing") ??
      (data.suspension_reason === "BILLING_OVERDUE" && data.billing_access));
  const destination = billing ? "/hr/billing" : "/employee/account";
  const allowed =
    path === "/employee/account" || (billing && path === "/hr/billing");
  useEffect(() => {
    if (!allowed) router.replace(destination);
  }, [allowed, destination, router]);
  return (
    <NavigationShell className="workspace restricted-workspace" sidebarClassName="restricted-nav" navigation={<>
        <Link href={destination} aria-label="Workspace home" className="desktop-nav-brand">
          <Brand />
        </Link>
        <div>
          <span className="badge suspension-badge">Company suspended</span>
          <p className="restricted-caption">
            {billing
              ? data.suspension_label || "Outstanding billing"
              : "Contact the Platform Administrator"}
          </p>
        </div>
        <nav aria-label="Main navigation">
          {billing && (
            <Link
              href="/hr/billing"
              aria-current={path === "/hr/billing" ? "page" : undefined}
            >
              Billing
            </Link>
          )}
          <Link
            href="/employee/account"
            aria-current={path === "/employee/account" ? "page" : undefined}
          >
            My account
          </Link>
        </nav>
        <Button
          variant="neutral"
          onClick={async () => {
            try {
              await session();
              await post("auth/logout/", {});
              window.location.replace("/auth/login");
            } catch {
              setError("Unable to sign out. Please try again.");
            }
          }}
        >
          Sign out
        </Button>
      </>}>
      <div className="workspace-main">
        <main id="main">
          <section
            className="suspension-notice"
            role="status"
            aria-label="Company suspension notice"
          >
            <strong>
              {billing
                ? "Company access restricted"
                : "Company access is temporarily suspended."}
            </strong>
            {billing && <p>Outstanding annual billing</p>}
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              <strong>Reason: </strong>
              {data.suspension_note || "No suspension note was recorded."}
            </p>
            {!billing && <p>Contact the Platform Administrator.</p>}
            {billing && (
              <>
                <Link className="button primary" href="/hr/billing">
                  Open Billing
                </Link>
                <p className="restricted-caption">
                  If you believe this is incorrect, contact the Platform
                  Administrator.
                </p>
              </>
            )}
          </section>
          <Feedback error={error} />
          {allowed && children}
        </main>
      </div>
    </NavigationShell> );
}
