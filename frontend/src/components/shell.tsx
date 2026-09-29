"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, post, session } from "@/lib/api";
import { confirmLeaveDraft } from "@/lib/draft-guard";
import type { Session, Employee, Context } from "@/lib/types";
import { Button, Feedback, Loading } from "./ui";
import { Brand } from "./brand";
import { Trainer } from "./trainer";
import { Tours } from "./tours";
import { NavIcon, routeIcon } from "./nav-icon";

const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext)!;
const names: Record<Context, string> = {
  employee: "My Work",
  manager: "My Team",
  hr: "HR Workspace",
  reviews: "My Reviews",
  approvals: "My Approvals",
};
export function Shell({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Session | null>(null),
    [profile, setProfile] = useState<Employee | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const router = useRouter(),
    path = usePathname(),
    drawer = useRef<HTMLElement>(null),
    menuButton = useRef<HTMLButtonElement>(null),
    restoreMenuFocus = useRef(false);
  useEffect(() => {
    if (!open) {
      if (restoreMenuFocus.current) {
        menuButton.current?.focus();
        restoreMenuFocus.current = false;
      }
      return;
    }
    drawer.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        restoreMenuFocus.current = true;
        setOpen(false);
      }
      if (event.key === "Tab") {
        const controls = drawer.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled]),select:not([disabled])",
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);
  useEffect(() => {
    const refresh = () => {
      session()
        .then(setData)
        .catch(() => undefined);
      api<Employee>("auth/profile/")
        .then(setProfile)
        .catch(() => undefined);
    };
    window.addEventListener("bfl-profile-updated", refresh);
    return () => window.removeEventListener("bfl-profile-updated", refresh);
  }, []);
  useEffect(() => {
    let alive = true;
    session()
      .then(async (s) => {
        if (!s.authenticated) {
          router.replace("/auth/login");
          return;
        }
        if (s.is_platform_admin) {
          router.replace("/platform");
          return;
        }
        if (!s.company_id) {
          router.replace("/auth/request-status");
          return;
        }
        if (alive) setData(s);
        if (s.company_id) {
          const p = await api<Employee>("auth/profile/");
          if (alive) setProfile(p);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [router]);
  async function change(context: Context) {
    if (!confirmLeaveDraft()) return false;
    try {
      await post("auth/context/", { company_id: data?.company_id, context });
      setData(await session());
      router.push(
        context === "approvals"
          ? "/hr/approvals"
          : context === "reviews"
            ? "/employee/reviews"
            : `/${context}/dashboard`,
      );
      setOpen(false);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  async function switchCompany(company_id: string) {
    if (!confirmLeaveDraft()) return;
    try {
      await post("auth/context/", { company_id, context: "employee" });
      const next = await session();
      setData(next);
      setProfile(await api<Employee>("auth/profile/"));
      router.push("/employee/dashboard");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!data) return error ? <Feedback error={error} /> : <Loading />;
  const company = data.memberships?.find(
      (m) => m.company_id === data.company_id,
    ),
    role =
      data.context === "hr"
        ? "hr"
        : data.context === "manager"
          ? "manager"
          : "employee";
  const links =
    role === "hr"
      ? [
          ["Dashboard", "/hr/dashboard"],
          ["People directory", "/hr/employees"],
          ["Join requests", "/hr/join-requests"],
          ["Organisation", "/hr/organisation"],
          ["Management structure", "/hr/management-structure"],
          ["Company settings", "/hr/settings"],
          ["Review oversight", "/hr/reviews"],
          ["Review cycles", "/hr/review-cycles"],
        ]
      : role === "manager"
        ? [
            ["Team home", "/manager/dashboard"],
            ["Team work", "/manager/tasks"],
            ["My team", "/manager/team"],
            ["Reviews I conduct", "/manager/reviews"],
            ["Team development", "/manager/development"],
          ]
        : [
            ["My home", "/employee/dashboard"],
            ["My work", "/employee/tasks"],
            ["My evaluation", "/employee/reviews"],
            ["My development", "/employee/development"],
          ];
  links.push(
    ["Growth tools", "/employee/growth"],
    ["Review history", "/employee/review-history"],
  );
  return (
    <SessionContext value={data}>
      <Tours allowed={data.contexts || []} onContextChange={change}>
        <div className="workspace">
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <aside
            ref={drawer}
            className={open ? "sidebar expanded" : "sidebar"}
            role={open ? "dialog" : undefined}
            aria-modal={open ? true : undefined}
            aria-label={open ? "Workspace navigation" : undefined}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            {open && (
              <Button
                className="menu-toggle"
                variant="neutral"
                onClick={() => {
                  restoreMenuFocus.current = true;
                  setOpen(false);
                }}
              >
                Close menu
              </Button>
            )}
            <Link href={`/${role}/dashboard`} className="brand">
              <Brand />
            </Link>
            <label className="context-label">
              WORKSPACE
              <select
                value={data.context}
                onChange={(e) => change(e.target.value as Context)}
              >
                {data.contexts?.map((c) => (
                  <option key={c} value={c}>
                    {names[c]}
                  </option>
                ))}
              </select>
            </label>
            <nav aria-label="Main navigation">
              {links.map(([label, url]) => (
                <Link
                  key={url}
                  href={url}
                  aria-current={path === url ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <NavIcon name={routeIcon(url)} />
                  {label}
                </Link>
              ))}
              <Link href="/employee/notifications">
                <NavIcon name="flag" />
                My actions
              </Link>
              {data.contexts?.includes("approvals") && (
                <Link href="/hr/approvals">
                  <NavIcon name="approval" />
                  My approvals
                </Link>
              )}
            </nav>
            <div className="sidebar-bottom">
              <Link href="/employee/guide" className="guide-link">
                <span>
                  <NavIcon name="guide" />
                  Stewardship Guide
                </span>
                <small>A little guidance goes a long way.</small>
              </Link>
              <Link href="/employee/onboarding" className="sidebar-secondary">
                <NavIcon name="intro" />
                Platform introduction
              </Link>
              <Link href="/employee/account" className="sidebar-secondary">
                <NavIcon name="account" />
                My account
              </Link>
            </div>
            <div className="identity">
              <div className="identity-row">
                {profile?.photo_url && (
                  <Image
                    className="avatar"
                    src={profile.photo_url}
                    width={40}
                    height={40}
                    unoptimized
                    alt="Your profile"
                    referrerPolicy="no-referrer"
                  />
                )}
                {!profile?.photo_url && (
                  <span className="avatar-initials" aria-hidden="true">
                    {data.user?.first_name?.[0]}
                    {data.user?.last_name?.[0]}
                  </span>
                )}
                <div>
                  <strong>
                    {data.user?.first_name} {data.user?.last_name}
                  </strong>
                  <small>
                    {profile?.designation}
                    {profile?.joined_on
                      ? ` · Since ${profile.joined_on.slice(0, 4)}`
                      : ""}
                  </small>
                </div>
              </div>
              <Button
                type="button"
                variant="neutral"
                onClick={async () => {
                  if (!confirmLeaveDraft()) return;
                  try {
                    setError("");
                    await session();
                    await post("auth/logout/", {});
                    setData(null);
                    setProfile(null);
                    window.location.replace("/auth/login");
                  } catch {
                    setError("Unable to sign out. Please try again.");
                  }
                }}
              >
                Sign out
              </Button>
            </div>
          </aside>
          <div className="workspace-main" inert={open || undefined}>
            <header>
              {(data.memberships?.length || 0) > 1 && (
                <label>
                  Organisation
                  <select
                    value={data.company_id}
                    onChange={(e) => switchCompany(e.target.value)}
                  >
                    {data.memberships?.map((m) => (
                      <option key={m.company_id} value={m.company_id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button
                ref={menuButton}
                variant="neutral"
                className="menu-toggle"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                Menu
              </Button>
              <div className="workspace-company">
                {company?.logo_url && (
                  <Image
                    className="company-logo"
                    src={company.logo_url}
                    width={36}
                    height={36}
                    unoptimized
                    alt={`${company.name} logo`}
                    referrerPolicy="no-referrer"
                  />
                )}
                <strong>{company?.name}</strong>
                <small>{company?.tagline}</small>
              </div>
              <div className="header-tools">
                <div className="workspace-search">
                  <input
                    aria-label="Search workspace pages"
                    type="search"
                    placeholder="Search workspace"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSearch("");
                    }}
                  />
                  {search.trim() && (
                    <div className="search-results">
                      {[
                        ...links,
                        ["Stewardship guide", "/employee/guide"],
                        ["My account", "/employee/account"],
                        ["My actions", "/employee/notifications"],
                      ]
                        .filter(([label]) =>
                          label.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map(([label, url]) => (
                          <Link
                            key={url}
                            href={url}
                            onClick={() => setSearch("")}
                          >
                            {label}
                          </Link>
                        ))}
                      {![
                        ...links,
                        ["Stewardship guide"],
                        ["My account"],
                        ["My actions"],
                      ].some(([label]) =>
                        label.toLowerCase().includes(search.toLowerCase()),
                      ) && <p>No matching pages</p>}
                    </div>
                  )}
                </div>
                <Link
                  className="notification-link"
                  href="/employee/notifications"
                  aria-label="Notifications"
                >
                  <NavIcon name="bell" />
                </Link>
                <Link className="header-profile" href="/employee/account">
                  {profile?.photo_url ? (
                    <Image
                      className="avatar"
                      src={profile.photo_url}
                      width={32}
                      height={32}
                      alt="Your profile"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="avatar-initials" aria-hidden="true">
                      {data.user?.first_name?.[0]}
                      {data.user?.last_name?.[0]}
                    </span>
                  )}
                  <span>
                    {data.user?.first_name} {data.user?.last_name}
                    <small>
                      {profile?.joined_on
                        ? `Since ${profile.joined_on.slice(0, 4)}`
                        : profile?.designation}
                    </small>
                  </span>
                </Link>
              </div>
            </header>
            <main id="main" tabIndex={-1}>
              <Feedback error={error} />
              {(path.startsWith("/hr/") && !data.contexts?.includes("hr")) ||
              (path.startsWith("/manager/") &&
                !data.contexts?.includes("manager")) ? (
                <Feedback error="This responsibility is not available to your account." />
              ) : (
                <div key={data.company_id}>{children}</div>
              )}
              <footer>Powered by ICORENIC PVT LTD</footer>
            </main>
          </div>
        </div>
        {!open && <Trainer key={`${data.company_id}:${data.user?.id}`} />}
      </Tours>
    </SessionContext>
  );
}
