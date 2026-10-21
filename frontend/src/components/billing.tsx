"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, post } from "@/lib/api";
import { Badge, Button, Card, Feedback, Loading } from "./ui";

type Proof = {
  id: string;
  invoice_number: string;
  company_name: string;
  amount: string;
  currency: string;
  submitted_by: string;
  payment_date: string;
  transaction_reference: string;
  created_at: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason: string;
  verified_at: string | null;
  file_url: string;
};
type Invoice = {
  id: string;
  company: string;
  company_name: string;
  billing_year: number;
  invoice_number: string;
  amount: string;
  tax_amount: string;
  total_amount: string;
  currency: string;
  issued_at: string;
  due_at: string;
  status: "AWAITING_PAYMENT" | "PAYMENT_PROOF_SUBMITTED" | "PAID";
  is_overdue: boolean;
  paid_at: string | null;
  pdf_url: string;
  proofs: Proof[];
};
type Settings = Record<string, string | number | boolean | null>;
const labels: Record<string, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  PAYMENT_PROOF_SUBMITTED:
    "Payment proof submitted — awaiting Admin verification",
  PAID: "Paid",
  PENDING: "Awaiting verification",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
const money = (i: Invoice) =>
  `${i.currency} ${Number(i.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function proofError(file: File) {
  if (
    !/\.(pdf|jpe?g|png)$/i.test(file.name) ||
    !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
  )
    return "Choose a PDF, JPG/JPEG or PNG file.";
  if (file.size > 10 * 1024 * 1024)
    return "Payment proof must be 10 MB or smaller.";
  if (!file.size) return "Choose a nonempty payment proof.";
  return "";
}

function InvoiceCard({ invoice: i }: { invoice: Invoice }) {
  return (
    <Card>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Billing year {i.billing_year}</p>
          <h2>{i.invoice_number}</h2>
          <p className="subtitle">{i.company_name}</p>
        </div>
        <InvoiceStatus invoice={i} />
      </div>
      <dl className="billing-facts">
        <div>
          <dt>Annual fee</dt>
          <dd>
            {i.currency} {i.amount}
          </dd>
        </div>
        <div>
          <dt>Tax / VAT</dt>
          <dd>
            {i.currency} {i.tax_amount}
          </dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{money(i)}</dd>
        </div>
        <div>
          <dt>Issued</dt>
          <dd>{i.issued_at}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{i.due_at}</dd>
        </div>
      </dl>
      {i.paid_at && (
        <p className="subtitle">
          Verified on {new Date(i.paid_at).toLocaleDateString()}
        </p>
      )}
      {i.status === "PAYMENT_PROOF_SUBMITTED" && (
        <p className="billing-note">
          Payment proof submitted. Awaiting Super Admin verification.
        </p>
      )}
      <div className="actions">
        <a
          className="button neutral"
          href={i.pdf_url}
          target="_blank"
          rel="noreferrer"
        >
          View Invoice
        </a>
        <a className="button neutral" href={`${i.pdf_url}?download=1`}>
          Download PDF
        </a>
      </div>
      {i.proofs.map((p) => (
        <p key={p.id}>
          <a href={p.file_url} target="_blank" rel="noreferrer">
            Payment proof
          </a>{" "}
          <ProofStatus status={p.status} />
          {p.rejection_reason && `: ${p.rejection_reason}`}
        </p>
      ))}
    </Card>
  );
}

function ProofStatus({ status }: { status: Proof["status"] }) {
  return (
    <span
      className={
        status === "APPROVED"
          ? "billing-status-success"
          : status === "REJECTED"
            ? "billing-status-error"
            : undefined
      }
    >
      <Badge>{labels[status]}</Badge>
    </span>
  );
}

function InvoiceStatus({ invoice }: { invoice: Invoice }) {
  return (
    <span className="billing-statuses">
      <span
        className={
          invoice.status === "PAID" ? "billing-status-success" : undefined
        }
      >
        <Badge>
          {invoice.status === "PAYMENT_PROOF_SUBMITTED"
            ? "Proof submitted"
            : labels[invoice.status]}
        </Badge>
      </span>
      {invoice.is_overdue && (
        <span className="billing-status-warning">
          <Badge>Overdue</Badge>
        </span>
      )}
    </span>
  );
}

function InvoiceTable({
  invoices,
  platform = false,
}: {
  invoices: Invoice[];
  platform?: boolean;
}) {
  return (
    <Card>
      <div
        className="table-scroll"
        role="region"
        aria-label={platform ? "Company invoices" : "Invoice history"}
        tabIndex={0}
      >
        <table className="billing-table">
          <caption className="billing-caption">
            {platform ? "Company invoices" : "Annual invoice history"}
          </caption>
          <thead>
            <tr>
              {platform && <th scope="col">Company</th>}
              <th scope="col">Year</th>
              <th scope="col">Invoice</th>
              <th scope="col">Amount</th>
              <th scope="col">Issued</th>
              <th scope="col">Due</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                {platform && <td>{i.company_name}</td>}
                <td>{i.billing_year}</td>
                <th scope="row">{i.invoice_number}</th>
                <td>{money(i)}</td>
                <td>{i.issued_at}</td>
                <td>{i.due_at}</td>
                <td>
                  <InvoiceStatus invoice={i} />
                </td>
                <td>
                  <div className="billing-row-actions">
                    <a href={i.pdf_url} target="_blank" rel="noreferrer">
                      View invoice
                    </a>
                    <a href={`${i.pdf_url}?download=1`}>Download PDF</a>
                  </div>
                  {i.proofs.length > 0 && (
                    <details className="billing-proof-history">
                      <summary>Payment proofs ({i.proofs.length})</summary>
                      {i.proofs.map((p) => (
                        <p key={p.id}>
                          <a href={p.file_url} target="_blank" rel="noreferrer">
                            View proof
                          </a>{" "}
                          <ProofStatus status={p.status} />
                          {p.rejection_reason && (
                            <small>{p.rejection_reason}</small>
                          )}
                        </p>
                      ))}
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const settingsGroups = {
  "Annual billing": ["annual_fee", "currency", "invoice_prefix"],
  "Invoice issuer": [
    "issuer_name",
    "issuer_address",
    "issuer_registration_number",
    "issuer_email",
    "issuer_phone",
  ],
  "Bank and payment details": [
    "bank_name",
    "bank_account_name",
    "bank_account_number",
    "bank_branch",
    "swift_code",
    "payment_instructions",
  ],
  "Invoice timing": ["issue_month", "issue_day", "due_days"],
  Tax: ["tax_number", "tax_rate"],
};
const fieldLabels: Record<string, string> = {
  annual_fee: "Annual default fee",
  currency: "Currency",
  invoice_prefix: "Invoice prefix",
  issuer_name: "Legal / company name",
  issuer_address: "Address",
  issuer_registration_number: "Registration number",
  issuer_email: "Email",
  issuer_phone: "Phone",
  bank_name: "Bank name",
  bank_account_name: "Account name",
  bank_account_number: "Account number",
  bank_branch: "Branch",
  swift_code: "SWIFT code",
  payment_instructions: "Payment instructions",
  issue_month: "Issue month",
  issue_day: "Issue day",
  due_days: "Payment due period (days)",
  tax_number: "Tax / VAT number",
  tax_rate: "Tax / VAT rate (%)",
};
const metricLabels: Record<string, string> = {
  total_companies: "Total companies",
  invoices_issued: "Invoices issued",
  paid: "Paid",
  awaiting_payment: "Awaiting payment",
  proofs_awaiting_review: "Proofs awaiting review",
  overdue: "Overdue",
};
const numeric = new Set([
  "annual_fee",
  "issue_month",
  "issue_day",
  "due_days",
  "tax_rate",
]);

export function Billing({ platform = false }: { platform?: boolean }) {
  const tabs = platform
    ? ["Overview", "Company Invoices", "Payment Proofs", "Billing Settings"]
    : ["Current Invoice", "Invoice History", "Upload Payment Proof"];
  const [tab, setTab] = useState(tabs[0]);
  const [current, setCurrent] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (platform) {
          const [o, i, p, s] = await Promise.all([
            api<Record<string, number>>(
              `platform/billing/overview/?year=${year}`,
            ),
            api<Invoice[]>(`platform/billing/invoices/?year=${year}`),
            api<Proof[]>(`platform/billing/payment-proofs/?year=${year}`),
            api<Settings>("platform/billing/settings/"),
          ]);
          if (alive) {
            setOverview(o);
            setInvoices(i);
            setProofs(p);
            setSettings(s);
          }
        } else {
          const c = await api<Invoice | null>("billing/current/");
          const h = await api<Invoice[]>("billing/history/");
          if (alive) {
            setCurrent(c);
            setInvoices(h);
          }
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [platform, year, revision]);
  async function action(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await work();
      setSuccess(message);
      setRevision((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get("file") as File;
    const invalid = proofError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    void action(
      () =>
        api("billing/current/payment-proof/", { method: "POST", body: data }),
      "Payment proof submitted. Awaiting verification.",
    );
  }
  const shownInvoices = invoices.filter(
    (i) =>
      (!company || i.company === company) &&
      (!status || (status === "OVERDUE" ? i.is_overdue : i.status === status)),
  );
  return (
    <section className="billing-page">
      <div className="page-heading">
        <div>
          <h1>{platform ? "Billing & Payments" : "Billing"}</h1>
          <p className="subtitle">
            Yearly company billing and payment verification.
          </p>
        </div>
      </div>
      <div
        className="account-tabs billing-tabs"
        role="tablist"
        aria-label="Billing sections"
      >
        {tabs.map((name, index) => (
          <button
            key={name}
            role="tab"
            id={`billing-tab-${index}`}
            aria-selected={tab === name}
            aria-current={tab === name ? "page" : undefined}
            aria-controls={`billing-panel-${index}`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(e) => {
              let next = index;
              if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (e.key === "ArrowLeft")
                next = (index + tabs.length - 1) % tabs.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = tabs.length - 1;
              else return;
              e.preventDefault();
              setTab(tabs[next]);
              document.getElementById(`billing-tab-${next}`)?.focus();
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <Feedback error={error} success={success} />
      {loading ? (
        <Loading />
      ) : (
        <div
          role="tabpanel"
          id={`billing-panel-${tabs.indexOf(tab)}`}
          aria-labelledby={`billing-tab-${tabs.indexOf(tab)}`}
        >
          {platform && tab !== "Billing Settings" && (
            <label className="billing-year">
              Billing year
              <input
                aria-label="Billing year"
                type="number"
                min="2000"
                max="9999"
                value={year}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 2000 && n <= 9999) setYear(n);
                }}
              />
            </label>
          )}
          {tab === "Current Invoice" &&
            (current ? (
              <InvoiceCard invoice={current} />
            ) : (
              <Card>
                <p className="empty">
                  No annual invoice is available for the current billing year.
                </p>
              </Card>
            ))}
          {tab === "Invoice History" &&
            (invoices.length ? (
              <InvoiceTable invoices={invoices} />
            ) : (
              <Card>
                <p className="empty">No previous invoices are available.</p>
              </Card>
            ))}
          {tab === "Upload Payment Proof" &&
            (current?.status === "AWAITING_PAYMENT" ? (
              <Card title="Upload Payment Proof">
                <p className="subtitle">
                  {current.invoice_number} · {money(current)} · Due{" "}
                  {current.due_at}
                </p>
                <form className="billing-upload" onSubmit={upload}>
                  <label>
                    Payment proof file
                    <input
                      name="file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      required
                      onChange={(e) =>
                        setError(
                          e.target.files?.[0]
                            ? proofError(e.target.files[0])
                            : "",
                        )
                      }
                    />
                  </label>
                  <small>PDF, JPG/JPEG or PNG. Maximum 10 MB.</small>
                  <label>
                    Transaction/reference ID
                    <input
                      name="transaction_reference"
                      maxLength={180}
                      required
                    />
                  </label>
                  <label>
                    Payment date
                    <input name="payment_date" type="date" required />
                  </label>
                  <Button disabled={busy}>Submit Payment Proof</Button>
                </form>
              </Card>
            ) : (
              <Card>
                <p className="empty">
                  {current?.status === "PAYMENT_PROOF_SUBMITTED"
                    ? "Payment proof submitted. Awaiting Super Admin verification."
                    : "No payment proof is currently required."}
                </p>
              </Card>
            ))}
          {tab === "Overview" && (
            <div className="stats billing-metrics">
              {Object.entries(overview).map(([key, value]) => (
                <Card
                  key={key}
                  title={metricLabels[key] || key.replaceAll("_", " ")}
                >
                  <div className="stat-value">{value}</div>
                </Card>
              ))}
            </div>
          )}
          {tab === "Company Invoices" && (
            <>
              <div className="billing-filters">
                <label>
                  Company
                  <select
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  >
                    <option value="">All companies</option>
                    {Array.from(
                      new Map(invoices.map((i) => [i.company, i.company_name])),
                    ).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    {[
                      "AWAITING_PAYMENT",
                      "PAYMENT_PROOF_SUBMITTED",
                      "PAID",
                      "OVERDUE",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {labels[s] || "Overdue"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {shownInvoices.length ? (
                <InvoiceTable invoices={shownInvoices} platform />
              ) : (
                <Card>
                  <p className="empty">No invoices match these filters.</p>
                </Card>
              )}
            </>
          )}
          {tab === "Payment Proofs" && (
            <>
              {!proofs.some((p) => p.status === "PENDING") && (
                <p className="empty">
                  No payment proofs are awaiting verification.
                </p>
              )}
              {proofs.length > 0 && (
                <Card>
                  <div
                    className="table-scroll"
                    role="region"
                    aria-label="Payment proofs"
                    tabIndex={0}
                  >
                    <table className="billing-table billing-proof-table">
                      <caption className="billing-caption">
                        Payment proof verification
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Company / Invoice</th>
                          <th scope="col">Amount</th>
                          <th scope="col">Payment date / Reference</th>
                          <th scope="col">Submitted</th>
                          <th scope="col">Status</th>
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proofs.map((p) => (
                          <tr key={p.id}>
                            <th scope="row">
                              {p.company_name}
                              <small>{p.invoice_number}</small>
                            </th>
                            <td>
                              {p.currency} {p.amount}
                            </td>
                            <td>
                              {p.payment_date}
                              <small>{p.transaction_reference}</small>
                            </td>
                            <td>
                              {new Date(p.created_at).toLocaleString()}
                              <small>{p.submitted_by}</small>
                            </td>
                            <td>
                              <ProofStatus status={p.status} />
                            </td>
                            <td>
                              <a
                                className="billing-proof-link"
                                href={p.file_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View Proof
                              </a>
                              {p.rejection_reason && (
                                <p className="billing-rejection-note">
                                  Rejection reason: {p.rejection_reason}
                                </p>
                              )}
                              {p.status === "PENDING" && (
                                <>
                                  <label>
                                    Rejection reason
                                    <textarea
                                      rows={2}
                                      value={reasons[p.id] || ""}
                                      maxLength={2000}
                                      onChange={(e) =>
                                        setReasons({
                                          ...reasons,
                                          [p.id]: e.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <div className="actions">
                                    <Button
                                      disabled={busy}
                                      onClick={() =>
                                        void action(
                                          () =>
                                            post(
                                              `platform/billing/payment-proofs/${p.id}/approve/`,
                                              {},
                                            ),
                                          "Payment approved. Invoice marked paid.",
                                        )
                                      }
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      variant="neutral"
                                      disabled={busy || !reasons[p.id]?.trim()}
                                      onClick={() =>
                                        void action(
                                          () =>
                                            post(
                                              `platform/billing/payment-proofs/${p.id}/reject/`,
                                              {
                                                rejection_reason: reasons[p.id],
                                              },
                                            ),
                                          "Payment proof rejected. The company can submit a replacement.",
                                        )
                                      }
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
          {tab === "Billing Settings" && (
            <form
              className="billing-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action(
                  () =>
                    api("platform/billing/settings/", {
                      method: "PUT",
                      body: JSON.stringify(settings),
                    }),
                  "Billing settings saved. Eligible annual invoices are available.",
                );
              }}
            >
              <p>Billing frequency: Yearly</p>
              <p className="subtitle">
                Changes apply to new invoices. Existing invoice amounts and
                issuer/payment details remain unchanged.
              </p>
              {Object.entries(settingsGroups).map(([title, fields]) => (
                <section
                  key={title}
                  className="billing-settings-section"
                  aria-label={title}
                >
                  <h2>{title}</h2>
                  <div className="form-grid">
                    {fields.map((key) => (
                      <label
                        key={key}
                        className={
                          ["issuer_address", "payment_instructions"].includes(
                            key,
                          )
                            ? "full"
                            : undefined
                        }
                      >
                        {fieldLabels[key]}
                        {["issuer_address", "payment_instructions"].includes(
                          key,
                        ) ? (
                          <textarea
                            value={String(settings[key] ?? "")}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                [key]: e.target.value,
                              })
                            }
                          />
                        ) : (
                          <input
                            type={
                              numeric.has(key)
                                ? "number"
                                : key === "issuer_email"
                                  ? "email"
                                  : "text"
                            }
                            step={numeric.has(key) ? "any" : undefined}
                            value={String(settings[key] ?? "")}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                [key]: numeric.has(key)
                                  ? e.target.value === ""
                                    ? null
                                    : Number(e.target.value)
                                  : e.target.value,
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              ))}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={!!settings.active}
                  onChange={(e) =>
                    setSettings({ ...settings, active: e.target.checked })
                  }
                />{" "}
                Activate annual billing
              </label>
              <Button disabled={busy}>Save Billing Settings</Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
