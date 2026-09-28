"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, allPages, post, session } from "@/lib/api";
import type { Session } from "@/lib/types";
import { Brand } from "./brand";
import { RequestQueue, dateTime } from "./access";
import { Button, Card, Feedback, Loading } from "./ui";

type Quote = {
  currency: string;
  tier: string;
  annual_licence: number | null;
  first_year_total: number | null;
  workshop_one_time: number;
  coaching_total: number;
  employees: number;
  market: string;
  requires_custom_quote: boolean;
};
type Company = {
  id: string;
  name: string;
  stewardship_code: string;
  nature: string;
  country: string;
  market: string;
  declared_employees: number | null;
  active: boolean;
  created_at: string;
  approved_at: string;
  people: number;
  tagline: string;
  quotes?: {
    id: string;
    calculation: Quote;
    note: string;
    created_at: string;
  }[];
  review_states?: { state: string; total: number }[];
};
type Person = {
  id: string;
  name: string;
  email: string;
  code: string;
  designation: string;
  employment_joined_on: string | null;
  platform_joined_at: string;
  active: boolean;
  role: string;
};
type Report = {
  id: string;
  employee: string;
  year: number;
  kind: string;
  finalised_at: string;
  sha256: string;
};
type Overview = {
  companies: number;
  active_companies: number;
  pending_companies: number;
  employees: number;
  finalised_reviews: number;
  markets: { market: string; total: number }[];
  recent_events: {
    action: string;
    company__name: string;
    created_at: string;
  }[];
};
const money = (n: number | null, currency: string) =>
  n === null
    ? "Custom proposal"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);

function RecordContent({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>Not recorded</span>;
  if (Array.isArray(value))
    return (
      <div>
        {value.map((v, i) => (
          <div className="report-item" key={i}>
            <RecordContent value={v} />
          </div>
        ))}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl className="report-content">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>{k.replaceAll("_", " ")}</dt>
            <dd>
              <RecordContent value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <span>{String(value)}</span>;
}

export function Platform() {
  const router = useRouter();
  const [user, setUser] = useState<Session | null>(null),
    [view, setView] = useState("Overview"),
    [overview, setOverview] = useState<Overview | null>(null),
    [companies, setCompanies] = useState<Company[]>([]),
    [selected, setSelected] = useState<Company | null>(null),
    [people, setPeople] = useState<Person[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [record, setRecord] = useState<unknown>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const [o, c] = await Promise.all([
      api<Overview>("platform/overview/"),
      allPages<Company>("platform/companies/"),
    ]);
    setOverview(o);
    setCompanies(c);
  }
  useEffect(() => {
    session()
      .then(async (s) => {
        if (!s.authenticated) {
          router.replace("/auth/login");
          return;
        }
        if (!s.is_platform_admin) {
          setError("Super-admin access is required.");
          return;
        }
        setUser(s);
        await refresh();
      })
      .catch((e) => setError(e.message));
  }, [router]);
  async function open(c: Company) {
    setError("");
    setSuccess("");
    setRecord(null);
    setBusy(true);
    try {
      const [detail, p, r] = await Promise.all([
        api<Company>(`platform/companies/${c.id}/`),
        allPages<Person>(`platform/companies/${c.id}/people/`),
        allPages<Report>(`platform/companies/${c.id}/reports/`),
      ]);
      setSelected(detail);
      setPeople(p);
      setReports(r);
      setView("Companies");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function access(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await post(`platform/companies/${selected.id}/access/`, {
        active: !selected.active,
        note: new FormData(e.currentTarget).get("note"),
      });
      await open(selected);
      await refresh();
      setSuccess("Company access updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!user)
    return (
      <main className="access-status">
        <Feedback error={error} />
        {!error && <Loading />}
      </main>
    );
  return (
    <div className="platform-shell">
      <aside className="platform-nav">
        <Brand />
        <span className="platform-label">PLATFORM ADMINISTRATION</span>
        <nav>
          {["Overview", "Company requests", "Companies"].map((t) => (
            <button
              key={t}
              aria-current={view === t ? "page" : undefined}
              onClick={() => {
                setView(t);
                setSelected(null);
                setRecord(null);
              }}
            >
              {t}
              {t === "Company requests" && !!overview?.pending_companies && (
                <span className="badge">{overview.pending_companies}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="platform-person">
          <span className="avatar-initials">BE</span>
          <strong>
            {user.user?.first_name} {user.user?.last_name}
          </strong>
          <small>Platform super admin</small>
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
      </aside>
      <main className="platform-main">
        <header className="platform-top">
          <span>Beyond the Finish Line / {view}</span>
          <span className="badge">Platform oversight</span>
        </header>
        <Feedback error={error} success={success} />
        {busy && <p role="status">Loading company details…</p>}
        {view === "Overview" && overview && (
          <>
            <section className="company-hero">
              <div>
                <p className="eyebrow">THE BIGGER PICTURE</p>
                <h1>Welcome, Bradley.</h1>
                <p>One view of the organisations building a lasting legacy.</p>
                <Button onClick={() => setView("Company requests")}>
                  Review company requests →
                </Button>
              </div>
              <div className="hero-disc">
                <strong>{overview.active_companies}</strong>
                <span>active companies</span>
              </div>
            </section>
            <div className="stats">
              <Card title="Companies">
                <div className="stat-value">{overview.companies}</div>
                <small>{overview.active_companies} with active access</small>
              </Card>
              <Card title="Awaiting verification">
                <div className="stat-value">{overview.pending_companies}</div>
                <small>Company requests for your decision</small>
              </Card>
              <Card title="People connected">
                <div className="stat-value">{overview.employees}</div>
                <small>Active company memberships</small>
              </Card>
              <Card title="Stewardship records">
                <div className="stat-value">{overview.finalised_reviews}</div>
                <small>Finalised human-reviewed records</small>
              </Card>
            </div>
            <div className="split">
              <Card title="Companies by market">
                <p className="chart-subtitle">
                  Registered organisations, including suspended workspaces
                </p>
                {overview.markets.map((m) => (
                  <div className="market-bar" key={m.market}>
                    <span>
                      {m.market === "SL"
                        ? "Sri Lanka"
                        : m.market === "GLOBAL"
                          ? "Global / Western"
                          : "Regional"}
                    </span>
                    <progress
                      value={m.total}
                      max={Math.max(overview.companies, 1)}
                    />
                    <strong>{m.total}</strong>
                  </div>
                ))}
                {!overview.markets.length && (
                  <p>Approve your first company to begin.</p>
                )}
              </Card>
              <Card title="Recent platform activity">
                {overview.recent_events.map((e, i) => (
                  <p className="event-row" key={i}>
                    <strong>
                      {e.action.replaceAll(".", " · ").replaceAll("_", " ")}
                    </strong>
                    <span>
                      {e.company__name || "Platform"} · {dateTime(e.created_at)}
                    </span>
                  </p>
                ))}
              </Card>
            </div>
          </>
        )}
        {view === "Company requests" && (
          <RequestQueue
            platform
            onChanged={() => void refresh().catch((e) => setError(e.message))}
          />
        )}
        {view === "Companies" && !selected && (
          <>
            <div className="page-heading">
              <div>
                <h1>Companies</h1>
                <p>Access, people, pricing and stewardship reports.</p>
              </div>
              <input
                aria-label="Search companies"
                placeholder="Search name or stewardship code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="request-grid">
              {companies
                .filter((c) =>
                  `${c.name} ${c.stewardship_code}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((c) => (
                  <Card title={c.name} key={c.id}>
                    <div className="action-row">
                      <span className="badge">{c.stewardship_code}</span>
                      <span>{c.active ? "Active" : "Suspended"}</span>
                    </div>
                    <p>
                      {c.nature || "Industry not specified"} ·{" "}
                      {c.country || "Country not specified"}
                    </p>
                    <div className="stat-value">
                      {c.people}
                      <small> people</small>
                    </div>
                    <p>
                      Platform joined {dateTime(c.approved_at || c.created_at)}
                    </p>
                    <Button variant="neutral" onClick={() => open(c)}>
                      Open company →
                    </Button>
                  </Card>
                ))}
            </div>
          </>
        )}
        {selected && view === "Companies" && (
          <>
            <Button
              variant="neutral"
              onClick={() => {
                setSelected(null);
                setRecord(null);
              }}
            >
              ← All companies
            </Button>
            <section className="company-hero">
              <div>
                <p className="eyebrow">
                  {selected.stewardship_code} ·{" "}
                  {selected.active ? "ACTIVE" : "SUSPENDED"}
                </p>
                <h1>{selected.name}</h1>
                <p>{selected.tagline || "A new chapter in stewardship."}</p>
                <small>
                  {selected.nature || "Industry not provided"} ·{" "}
                  {selected.country || "Country not provided"} · Joined{" "}
                  {dateTime(selected.approved_at || selected.created_at)}
                </small>
              </div>
              <div className="hero-disc">
                <strong>{selected.people}</strong>
                <span>active people</span>
              </div>
            </section>
            <Pricing
              key={selected.id}
              company={selected}
              onSaved={() => open(selected)}
            />
            <Card title="People and joining dates">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Person / code</th>
                      <th>Responsibility</th>
                      <th>Employment start</th>
                      <th>Platform joined</th>
                      <th>Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>
                            {p.code} · {p.email}
                          </small>
                        </td>
                        <td>
                          {p.designation}
                          <small>{p.role}</small>
                        </td>
                        <td>{p.employment_joined_on || "Not recorded"}</td>
                        <td>{dateTime(p.platform_joined_at)}</td>
                        <td>{p.active ? "Active" : "Inactive"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Company stewardship reports">
              <p>
                Finalised records only. Opening a record is recorded in the
                platform audit log.
              </p>
              <div className="review-state-strip">
                {selected.review_states?.map((s) => (
                  <span key={s.state} className="badge">
                    {s.state.replaceAll("_", " ")} · {s.total}
                  </span>
                ))}
              </div>
              {reports.length ? (
                reports.map((r) => (
                  <div className="report-row" key={r.id}>
                    <div>
                      <strong>{r.employee}</strong>
                      <p>
                        {r.kind.replaceAll("_", " ")} {r.year} ·{" "}
                        {dateTime(r.finalised_at)}
                      </p>
                    </div>
                    <Button
                      variant="neutral"
                      onClick={async () => {
                        try {
                          setRecord(await api(`platform/reports/${r.id}/`));
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Read final record
                    </Button>
                  </div>
                ))
              ) : (
                <p className="empty">No finalised stewardship reports yet.</p>
              )}
              {record !== null && (
                <section className="saved-report">
                  <Button variant="neutral" onClick={() => setRecord(null)}>
                    Close record
                  </Button>
                  <RecordContent value={record} />
                </section>
              )}
            </Card>
            <Card title="Company access">
              <p>
                {selected.active
                  ? "Suspending access prevents all company members from entering the workspace. Saved records are retained."
                  : "Restore access for approved company members."}
              </p>
              <form onSubmit={access}>
                <label>
                  Reason
                  <textarea required name="note" maxLength={2000} />
                </label>
                <Button disabled={busy} variant="neutral">
                  {selected.active
                    ? "Suspend company access"
                    : "Restore company access"}
                </Button>
              </form>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function Pricing({
  company,
  onSaved,
}: {
  company: Company;
  onSaved: () => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(
      company.quotes?.[0]?.calculation || null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function calculate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const save =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "save";
    const values = {
      market: f.get("market"),
      employees: Number(f.get("employees")),
      white_label: f.get("white_label") === "on",
      workshop: f.get("workshop") === "on",
      coaching_quarters: Number(f.get("coaching_quarters")),
      custom_annual: f.get("custom_annual") || undefined,
      note: f.get("note"),
    };
    try {
      if (save) {
        await post(`platform/companies/${company.id}/quote/`, values);
        onSaved();
      } else {
        setQuote(await post<Quote>("platform/pricing/", values));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Annual licence calculator">
      <p>
        Based on the supplied 2026 pricing. Company nature:{" "}
        <strong>{company.nature || "Not provided"}</strong>. Estimates do not
        create an invoice or collect payment.
      </p>
      <div className="pricing-grid">
        <form onSubmit={calculate}>
          <div className="form-two">
            <label>
              Market
              <select name="market" defaultValue={company.market}>
                <option value="SL">Sri Lanka · LKR</option>
                <option value="REGIONAL">Regional · USD</option>
                <option value="GLOBAL">Global / Western · USD</option>
              </select>
            </label>
            <label>
              Licensed employee count
              <input
                type="number"
                name="employees"
                required
                min={Math.max(1, company.people)}
                defaultValue={Math.max(
                  company.declared_employees || 0,
                  company.people,
                )}
              />
              <small>
                {company.people} active memberships;{" "}
                {company.declared_employees ?? "Not recorded"} declared
                employees
              </small>
            </label>
            <label>
              Coaching quarters
              <select name="coaching_quarters">
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Negotiated annual licence
              <input
                type="number"
                min={0}
                step="0.01"
                name="custom_annual"
                placeholder="Optional override"
              />
            </label>
          </div>
          <label className="check-label">
            <input type="checkbox" name="workshop" />
            Implementation workshop · one time
          </label>
          <label className="check-label">
            <input type="checkbox" name="white_label" />
            White Label Partner · Global USD 15,000 / year
          </label>
          <label>
            Quote note
            <textarea
              name="note"
              maxLength={2000}
              placeholder="Required for a negotiated price. Record scope and verification."
            />
          </label>
          <div className="action-row">
            <Button disabled={busy} name="action" value="preview">
              Calculate estimate
            </Button>
            <Button
              disabled={busy}
              variant="neutral"
              name="action"
              value="save"
            >
              Save quote
            </Button>
          </div>
          <Feedback error={error} />
        </form>
        <div className="quote-result">
          {quote ? (
            <>
              <span className="eyebrow">
                {quote.tier} · {quote.employees} PEOPLE
              </span>
              <h2>{money(quote.annual_licence, quote.currency)}</h2>
              <p>Annual platform licence</p>
              <hr />
              <p>
                Workshop{" "}
                <strong>
                  {money(quote.workshop_one_time, quote.currency)}
                </strong>
              </p>
              <p>
                Coaching{" "}
                <strong>{money(quote.coaching_total, quote.currency)}</strong>
              </p>
              <h3>
                First-year total
                <br />
                {money(quote.first_year_total, quote.currency)}
              </h3>
            </>
          ) : (
            <>
              <span className="eyebrow">A PRICE THAT FITS</span>
              <h2>
                One annual licence.
                <br />
                Your whole team.
              </h2>
              <p>
                Calculate an estimate using the company’s market and headcount.
              </p>
            </>
          )}
          <small>
            1,001+ employees require a custom proposal. Industry has no
            automatic multiplier. Book + Tool Bundle (LKR 25,000 / USD 83) is a
            separate offer requiring scope confirmation.
          </small>
        </div>
      </div>
      {!!company.quotes?.length && (
        <details>
          <summary>Saved quote history ({company.quotes.length})</summary>
          {company.quotes.map((q) => (
            <p key={q.id}>
              {dateTime(q.created_at)} · {q.calculation.tier} ·{" "}
              {money(q.calculation.first_year_total, q.calculation.currency)}
              <br />
              {q.note}
            </p>
          ))}
        </details>
      )}
    </Card>
  );
}
