"use client";
import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, post, session } from "@/lib/api";
import type { Employee } from "@/lib/types";
import { AuthHero, EmailIcon, MobileAuthBrand } from "@/components/auth-brand";
import { Button, Feedback } from "@/components/ui";
export default function Login({
  admin = false,
  backUrl = "/",
}: {
  admin?: boolean;
  backUrl?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  const router = useRouter();
  const [brand, setBrand] = useState<{
    name: string;
    tagline: string;
    logo_url: string;
    slug: string;
  } | null>(null);
  useEffect(() => {
    session()
      .then((current) => {
        if (admin && current.authenticated && current.is_platform_admin) {
          router.replace("/platform");
          router.refresh();
        }
      })
      .catch((e) => setError(e.message));
    const slug = new URLSearchParams(window.location.search).get("company");
    if (slug && !admin)
      api<{ name: string; tagline: string; logo_url: string; slug: string }>(
        `auth/branding/${encodeURIComponent(slug)}/`,
      )
        .then(setBrand)
        .catch(() => setError("This company workspace link is not available."));
  }, [admin, router]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await post<{ redirect: string }>(
        admin ? "auth/admin-login/" : "auth/login/",
        {
          email: data.get("email"),
          password: data.get("password"),
          company_slug: brand?.slug || "",
          role: admin ? "platform" : data.get("role"),
        },
      );
      if (admin) {
        const current = await session();
        if (!current.authenticated || !current.is_platform_admin)
          throw new Error(
            "This account does not have Platform Administration access.",
          );
        router.replace("/platform");
        router.refresh();
        return;
      }
      if (result.redirect !== "/employee/dashboard") {
        router.replace(result.redirect);
        return;
      }
      const profile = await api<Employee>("auth/profile/");
      router.replace(
        profile.onboarding_completed_at
          ? "/employee/dashboard"
          : "/employee/onboarding",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="signin">
      <AuthHero />
      <div className="signin-form">
        <MobileAuthBrand />
        {brand?.logo_url && (
          <CompanyLogo
            className="signin-company-logo"
            src={brand.logo_url}
            width={130}
            height={56}
            name={brand.name}
          />
        )}
        <div className={`signin-wordmark${brand ? "" : " signin-product-wordmark"}`}>
          {brand?.name || "Beyond the Finish Line"}
        </div>
        <p className="eyebrow">
          {admin ? "PLATFORM ADMINISTRATION" : "YOUR WORKSPACE"}
        </p>
        <h1>Welcome back.</h1>
        <p className="subtitle">
          {admin
            ? "Sign in to manage platform operations."
            : brand?.tagline || "Your next chapter starts here."}
        </p>
        <form onSubmit={submit}>
          {!admin && (
            <label>
              Sign in as
              <select name="role" defaultValue="" required>
                <option value="" disabled>
                  Choose your role
                </option>
                <option value="hr">Chief Steward</option>
                <option value="employee">Steward Guy</option>
              </select>
            </label>
          )}
          <label>
            Business email
            <div className="email-field">
              <EmailIcon />
              <input
                name="email"
                type="email"
                placeholder="name@company.com"
                autoComplete="username"
                required
              />
            </div>
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                name="password"
                type={show ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow(!show)}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <Link className="forgot" href="/auth/forgot-password">
            Forgot password?
          </Link>
          <Feedback error={error} />
          <Button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
        {admin ? (
          <div className="signin-help">
            <a href={backUrl}>Back to BTFL</a>
          </div>
        ) : (
          <div className="signin-help">
            New to the platform?
            <p>
              <Link href="/auth/register">
                Register a company or request to join →
              </Link>
            </p>
          </div>
        )}
        <footer>Powered by ICORENIC PVT LTD</footer>
      </div>
    </main>
  );
}
