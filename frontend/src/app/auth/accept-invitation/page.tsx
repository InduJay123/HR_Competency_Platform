"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { post } from "@/lib/api";
import { Button, Feedback, Loading } from "@/components/ui";
import { AuthHero } from "@/components/auth-brand";
type Invitation = {
  email: string;
  first_name: string;
  last_name: string;
  company: string;
};
export default function AcceptInvitation() {
  const [invite, setInvite] = useState<Invitation | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  function token() {
    const q = new URLSearchParams(window.location.search);
    return { uid: q.get("uid"), token: q.get("token") };
  }
  useEffect(() => {
    post<Invitation>("auth/invitation/", token())
      .then(setInvite)
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await post<{ message: string }>("auth/invitation/", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        ...token(),
        accept: true,
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
      <AuthHero />
      <div className="signin-form">
        <p className="eyebrow">
          {invite ? "INVITATION VERIFIED" : "YOUR NEXT CHAPTER"}
        </p>
        <h1>You’re invited.</h1>
        <p className="subtitle">
          {invite
            ? `Join ${invite.company} to connect your work, growth and contribution.`
            : "Open the invitation sent by your HR team."}
        </p>
        <Feedback error={error} success={success} />
        {!invite && !error && <Loading />}
        {invite && !success && (
          <form onSubmit={submit}>
            <label>
              Business email
              <input value={invite.email} readOnly autoComplete="email" />
              <small>This address is linked to your invitation.</small>
            </label>
            <div className="form-grid">
              <label>
                First name
                <input
                  name="first_name"
                  required
                  maxLength={150}
                  defaultValue={invite.first_name}
                  autoComplete="given-name"
                />
              </label>
              <label>
                Last name
                <input
                  name="last_name"
                  required
                  maxLength={150}
                  defaultValue={invite.last_name}
                  autoComplete="family-name"
                />
              </label>
            </div>
            <label>
              Create password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
              />
            </label>
            <small>Use at least 12 characters.</small>
            <label>
              Confirm password
              <input
                name="confirm_password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
              />
            </label>
            <Button disabled={busy}>
              {busy ? "Saving…" : "Accept invitation"}
            </Button>
          </form>
        )}
        <Link className="auth-back" href="/auth/login">
          {success ? "Continue to sign in" : "Already have an account? Sign in"}
        </Link>
        <footer>Powered by ICORENIC PVT LTD</footer>
      </div>
    </main>
  );
}
