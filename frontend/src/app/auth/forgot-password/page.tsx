"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { post } from "@/lib/api";
import { Button, Feedback } from "@/components/ui";
import { AuthHero, RecoveryMark, EmailIcon } from "@/components/auth-brand";
export default function Recovery() {
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const r = await post<{ message: string }>("auth/password-reset/", {
        email: new FormData(e.currentTarget).get("email"),
      });
      setSuccess(r.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="signin">
      <AuthHero recovery />
      <div className="signin-form recovery-form">
        <Link className="auth-back" href="/auth/login">
          ← Back to sign in
        </Link>
        <RecoveryMark />
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Forgot password?</h1>
        <p className="subtitle">
          We’ll send a secure reset link to your business email.
          <br />
          You’ll be back on track in a moment.
        </p>
        <form onSubmit={submit}>
          <label>
            Business email
            <div className="email-field">
              <EmailIcon />
              <input
                name="email"
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                required
              />
            </div>
          </label>
          <small>Use the email linked to your workplace account.</small>
          <Button disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
          <Feedback error={error} success={success} />
        </form>
        <div className="signin-help">
          Can’t access your email? Contact your HR team.
        </div>
        <footer>Powered by ICORENIC PVT LTD</footer>
      </div>
    </main>
  );
}
