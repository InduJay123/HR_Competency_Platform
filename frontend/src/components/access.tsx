"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, allPages, post, session } from "@/lib/api";
import { Brand } from "./brand";
import { Button, Card, Feedback } from "./ui";

export type AccessRequest = {
  id: string;
  kind: string;
  status: string;
  name: string;
  email: string;
  company_name: string;
  created_at: string;
  decided_at: string | null;
  decision_note: string;
  details: Record<string, string | number>;
};
export const dateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not recorded";

export function Registration() {
  const [kind, setKind] = useState("COMPANY"),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (fields.password !== fields.confirm_password) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const result = await post<{ message: string }>("auth/register/", {
        ...fields,
        kind,
        employee_count: fields.employee_count
          ? Number(fields.employee_count)
          : undefined,
        joined_on: fields.joined_on || null,
      });
      setSuccess(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="access-page">
      <Link href="/auth/login">
        <Brand />
      </Link>
      <div className="access-grid">
        <aside className="access-story">
          <p className="eyebrow">A SHARED PURPOSE. A STRONGER TOMORROW.</p>
          <h1>
            Great work starts
            <br />
            with belonging.
          </h1>
          <p>
            Connect your people, recognise contribution and build what lasts.
          </p>
          <ol>
            <li>
              <strong>Request your place</strong>
              <span>Tell us who you are and which company you represent.</span>
            </li>
            <li>
              <strong>A person verifies your request</strong>
              <span>
                Bradley approves companies. Company HR approves employees.
              </span>
            </li>
            <li>
              <strong>Begin your stewardship journey</strong>
              <span>Receive your permanent code and enter your workspace.</span>
            </li>
          </ol>
          <div className="access-orbit" aria-hidden="true">
            <span>Character</span>
            <span>Contribution</span>
            <span>Capability</span>
            <span>Context</span>
            <span>Continuity</span>
          </div>
        </aside>
        <section className="access-form">
          <h2>Join Beyond the Finish Line</h2>
          <p>Workspace access is activated after approval.</p>
          <div className="access-tabs">
            <button
              aria-pressed={kind === "COMPANY"}
              onClick={() => {
                setKind("COMPANY");
                setSuccess("");
              }}
            >
              Register a company
            </button>
            <button
              aria-pressed={kind === "EMPLOYEE"}
              onClick={() => {
                setKind("EMPLOYEE");
                setSuccess("");
              }}
            >
              Join my company
            </button>
          </div>
          <Feedback error={error} success={success} />
          {success ? (
            <Link className="button primary" href="/auth/login">
              Sign in to track approval
            </Link>
          ) : (
            <form key={kind} onSubmit={submit}>
              <div className="form-two">
                <label>
                  First name
                  <input
                    name="first_name"
                    required
                    maxLength={150}
                    autoComplete="given-name"
                  />
                </label>
                <label>
                  Last name
                  <input
                    name="last_name"
                    required
                    maxLength={150}
                    autoComplete="family-name"
                  />
                </label>
              </div>
              <label>
                Business email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <div className="form-two">
                <label>
                  Phone
                  <input name="phone" type="tel" maxLength={32} />
                </label>
                <label>
                  Designation
                  <input
                    name="designation"
                    required
                    maxLength={160}
                    placeholder={
                      kind === "COMPANY" ? "Head of HR" : "Your role title"
                    }
                  />
                </label>
              </div>
              {kind === "COMPANY" ? (
                <>
                  <label>
                    Company name
                    <input name="company_name" required maxLength={180} />
                  </label>
                  <div className="form-two">
                    <label>
                      Company nature / industry
                      <input
                        name="nature"
                        required
                        placeholder="e.g. Manufacturing"
                        maxLength={180}
                      />
                    </label>
                    <label>
                      Employee count
                      <input
                        name="employee_count"
                        type="number"
                        min={1}
                        max={10000000}
                        required
                      />
                    </label>
                    <label>
                      Country
                      <input name="country" required maxLength={100} />
                    </label>
                    <label>
                      Pricing market
                      <select name="market">
                        <option value="SL">Sri Lanka · LKR</option>
                        <option value="REGIONAL">Regional · USD</option>
                        <option value="GLOBAL">Global / Western · USD</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Company website
                    <input name="website" type="url" placeholder="https://" />
                  </label>
                  <p className="field-hint">
                    You are requesting company administrator / Head of HR
                    access. Bradley will verify your authority before approving.
                  </p>
                </>
              ) : (
                <>
                  <label>
                    Company stewardship code
                    <input
                      name="company_code"
                      required
                      placeholder="ST0005"
                      pattern="[sS][tT][0-9]+"
                    />
                    <small>Ask your company HR for its code.</small>
                  </label>
                  <label>
                    Employment joining date
                    <input
                      name="joined_on"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                    />
                    <small>
                      This is your employment start date, separate from platform
                      approval.
                    </small>
                  </label>
                </>
              )}
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  required
                  autoComplete="new-password"
                />
                <small>
                  At least 12 characters. Existing account? Use its current
                  password.
                </small>
              </label>
              <label>
                Confirm password
                <input
                  name="confirm_password"
                  type="password"
                  required
                  autoComplete="new-password"
                />
              </label>
              <Button disabled={busy}>
                {busy ? "Submitting…" : "Send request for approval"}
              </Button>
              <p>
                <Link href="/auth/login">Already registered? Sign in →</Link>
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

export function RequestStatus() {
  const [items, setItems] = useState<AccessRequest[]>([]),
    [error, setError] = useState("");
  const router = useRouter();
  async function refresh() {
    try {
      const s = await session();
      if (!s.authenticated) {
        router.replace("/auth/login");
        return;
      }
      if (s.is_platform_admin) {
        router.replace("/platform");
        return;
      }
      setItems(await api<AccessRequest[]>("auth/requests/"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
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
        setItems(await api<AccessRequest[]>("auth/requests/"));
      })
      .catch((e) => setError(e.message));
  }, [router]);
  return (
    <main className="access-status">
      <Brand />
      <p className="eyebrow">YOUR STEWARDSHIP JOURNEY</p>
      <h1>Your place is being prepared.</h1>
      <p>
        Approval is a human decision. Your company workspace stays private until
        access is granted.
      </p>
      <Feedback error={error} />
      {items.map((r) => (
        <Card
          key={r.id}
          title={
            r.kind === "COMPANY"
              ? String(r.details.company_name)
              : r.company_name
          }
        >
          <span className="badge">{r.status}</span>
          <p>Requested {dateTime(r.created_at)}</p>
          <p>
            {r.status === "PENDING"
              ? r.kind === "COMPANY"
                ? "Waiting for Bradley’s company verification."
                : "Waiting for your company HR to approve membership."
              : r.decision_note}
          </p>
          {r.decided_at && <small>Decision {dateTime(r.decided_at)}</small>}
          {r.status === "APPROVED" && (
            <p>
              <Link href="/auth/login">
                Sign in again to open your approved workspace →
              </Link>
            </p>
          )}
        </Card>
      ))}
      <div className="action-row">
        <Button onClick={refresh}>Refresh status</Button>
        <Button
          variant="neutral"
          onClick={async () => {
            await post("auth/logout/", {});
            router.replace("/auth/login");
          }}
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}

export function RequestQueue({
  platform = false,
  onChanged,
}: {
  platform?: boolean;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<AccessRequest[]>([]),
    [selected, setSelected] = useState<AccessRequest | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("PENDING");
  async function refresh() {
    try {
      setItems(await allPages<AccessRequest>("access-requests/"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    allPages<AccessRequest>("access-requests/")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
  async function decide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await post(
        `access-requests/${selected.id}/decide/`,
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      setSelected(null);
      await refresh();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{platform ? "Company requests" : "Employee join requests"}</h1>
          <p>
            Verify{" "}
            {platform
              ? "the company and the applicant’s HR authority"
              : "employment and the appropriate responsibility"}{" "}
            before granting access.
          </p>
        </div>
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>PENDING</option>
            <option>APPROVED</option>
            <option>REJECTED</option>
            <option>ALL</option>
          </select>
        </label>
      </div>
      <Feedback error={error} />
      <div className="request-grid">
        {items
          .filter((r) => filter === "ALL" || r.status === filter)
          .map((r) => (
            <Card
              key={r.id}
              title={
                r.kind === "COMPANY" ? String(r.details.company_name) : r.name
              }
            >
              <span className="badge">{r.status}</span>
              <p>
                {r.name} · {r.details.designation}
              </p>
              <p>{r.email}</p>
              <small>Requested {dateTime(r.created_at)}</small>
              <p>
                {r.kind === "COMPANY"
                  ? `${r.details.nature} · ${r.details.employee_count} people · ${r.details.country}`
                  : `Company: ${r.company_name}`}
              </p>
              <Button variant="neutral" onClick={() => setSelected(r)}>
                Review request
              </Button>
            </Card>
          ))}
      </div>
      {!items.some((r) => filter === "ALL" || r.status === filter) && (
        <p className="empty">No {filter.toLowerCase()} requests to show.</p>
      )}
      {selected && (
        <section className="card decision-card">
          <div className="page-heading">
            <h2>Verify {selected.name}</h2>
            <Button variant="neutral" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
          <dl className="detail-grid">
            {Object.entries(selected.details).map(([k, v]) => (
              <div key={k}>
                <dt>{k.replaceAll("_", " ")}</dt>
                <dd>{String(v || "Not provided")}</dd>
              </div>
            ))}
          </dl>
          {selected.status === "PENDING" ? (
            <form onSubmit={decide}>
              <label>
                Decision
                <select name="decision">
                  <option value="APPROVED">Approve access</option>
                  <option value="REJECTED">Decline request</option>
                </select>
              </label>
              {!platform && (
                <label>
                  Approved responsibility
                  <select name="role">
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Manager + employee</option>
                    <option value="HR">
                      HR administrator (Head of HR approval required)
                    </option>
                  </select>
                </label>
              )}
              <label>
                Verification / decision note
                <textarea
                  name="note"
                  required
                  maxLength={2000}
                  placeholder="Record how you verified employment or company authority. This note is visible to the applicant."
                />
              </label>
              <Button disabled={busy}>
                {busy ? "Saving decision…" : "Save decision"}
              </Button>
            </form>
          ) : (
            <p>
              {selected.decision_note} · {dateTime(selected.decided_at)}
            </p>
          )}
        </section>
      )}
    </>
  );
}
