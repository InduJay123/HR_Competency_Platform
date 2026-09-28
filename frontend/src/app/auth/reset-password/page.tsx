"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { post } from "@/lib/api";
import { Button, Feedback } from "@/components/ui";
import { AuthHero, RecoveryMark } from "@/components/auth-brand";
export default function Reset() {
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const q = new URLSearchParams(window.location.search);
    try {
      const r = await post<{ message: string }>("auth/set-password/", {
        uid: q.get("uid"),
        token: q.get("token"),
        password: new FormData(e.currentTarget).get("password"),
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
        <h1>Set your password</h1>
        <p className="subtitle">
          Choose a strong password to protect your workspace.
        </p>
        <form onSubmit={submit}>
          <label>
            New password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <small>Use at least 12 characters.</small>
          <Button disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
          <Feedback error={error} success={success} />
        </form>
        <footer>Powered by ICORENIC PVT LTD</footer>
      </div>
    </main>
  );
}
