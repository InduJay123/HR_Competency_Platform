"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, post, session } from "@/lib/api";
import type { Employee } from "@/lib/types";
import { AuthHero, EmailIcon } from "@/components/auth-brand";
import { Button, Feedback } from "@/components/ui";
export default function Login() {
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
    session().catch((e) => setError(e.message));
    const slug = new URLSearchParams(window.location.search).get("company");
    if (slug)
      api<{ name: string; tagline: string; logo_url: string; slug: string }>(
        `auth/branding/${encodeURIComponent(slug)}/`,
      )
        .then(setBrand)
        .catch(() => setError("This company workspace link is not available."));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await post<{ redirect: string }>("auth/login/", {
        email: data.get("email"),
        password: data.get("password"),
        company_slug: brand?.slug || "",
        role: data.get("role"),
      });
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
        {brand?.logo_url && (
          <Image
            className="signin-company-logo"
            src={brand.logo_url}
            width={130}
            height={56}
            alt={`${brand.name} logo`}
            unoptimized
            referrerPolicy="no-referrer"
          />
        )}
        <div className="signin-wordmark">
          {brand?.name || "Beyond the Finish Line"}
        </div>
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Welcome back.</h1>
        <p className="subtitle">
          {brand?.tagline || "Your next chapter starts here."}
        </p>
        <form onSubmit={submit}>
          <label>
            Sign in as
            <select name="role" defaultValue="auto">
              <option value="auto">Automatic · my assigned access</option>
              <option value="platform">Platform super admin</option>
              <option value="hr">Company HR administrator</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
            </select>
          </label>
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
          <small>Use the company email linked to your invitation.</small>
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
        <div className="signin-help">
          New to the platform?
          <p>
            <Link href="/auth/register">
              Register a company or request to join →
            </Link>
          </p>
        </div>
        <footer>Powered by ICORENIC PVT LTD</footer>
      </div>
    </main>
  );
}
