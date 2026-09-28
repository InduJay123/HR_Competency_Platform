"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { human } from "@/lib/reviews";
import { useSession } from "./shell";
import { Card, Feedback, Loading } from "./ui";
import { ProgressScene } from "./workspace-motion";
import { PurposeJourney } from "./purpose-journey";
type Overview = {
  scope: string;
  as_of: string;
  work: {
    total: number;
    active: number;
    blocked: number;
    overdue: number;
    completed: number;
    due_items: number;
    on_time: number;
  };
  work_status: { status: string; total: number }[];
  completed_by_month: { month: string; total: number }[];
  reviews: { total: number; finalised: number; overdue: number };
  review_states: { state: string; total: number }[];
  departments: {
    employee__department__name: string | null;
    state: string;
    total: number;
  }[];
  people: number | null;
  next_reviews: {
    id: string;
    cycle__kind: string;
    cycle__year: number;
    cycle__due_on: string;
    state: string;
  }[];
  attention: { id: string; title: string; due_date: string; status: string }[];
};
export function Dashboard({ role }: { role: "employee" | "manager" | "hr" }) {
  const session = useSession(),
    [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api<Overview>(`reports/overview/?scope=${role}`)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [role, session.company_id]);
  const base = role === "hr" ? "/hr/reviews" : `/${role}/reviews`;
  const company = session.memberships?.find(
    (m) => m.company_id === session.company_id,
  );
  return (
    <>
      <section className="company-hero dashboard-company-hero">
        <div>
          <p className="eyebrow">
            {company?.stewardship_code} · OUR SHARED PURPOSE
          </p>
          <h1>{company?.name}</h1>
          <p>
            {company?.tagline ||
              "Contribute to purpose. Leave a lasting impact."}
          </p>
          <div className="company-purpose">
            <div>
              <span>OUR VISION</span>
              <p>
                {company?.vision ||
                  "Your company vision will appear here once HR adds it."}
              </p>
            </div>
            <div>
              <span>OUR MISSION</span>
              <p>
                {company?.mission ||
                  "Your company mission will appear here once HR adds it."}
              </p>
            </div>
          </div>
        </div>
        <PurposeJourney />
      </section>
      <div className="page-heading">
        <div>
          <h1>
            {role === "hr"
              ? "HR overview"
              : role === "manager"
                ? "Team home"
                : `Good to see you, ${session.user?.first_name}`}
          </h1>
          <p className="subtitle">
            {role === "manager"
              ? "Notice progress. Make support visible. Keep conversations moving."
              : "A clear view of your work, review journey and next steps."}
          </p>
        </div>
        <Link
          className="button primary"
          href={role === "manager" ? "/manager/tasks/create" : base}
        >
          {role === "manager" ? "Assign work" : "Open reviews"}
        </Link>
      </div>
      <Feedback error={error} />
      {!data ? (
        !error && <Loading />
      ) : (
        <>
          {role === "manager" && (
            <section className="dashboard-banner">
              <div>
                <h2>A small conversation can move work forward.</h2>
                <p>
                  {data.work.blocked
                    ? `${data.work.blocked} work items need support. Start with what is getting in the way.`
                    : "Keep outcomes clear and check whether your team needs support."}
                </p>
              </div>
              <Link
                className="button neutral"
                href="/manager/tasks?status=BLOCKED"
              >
                View team blockers
              </Link>
            </section>
          )}
          <div className="stats motion-stats">
            <Card title="Active work">
              <div className="stat-value">{data.work.active}</div>
              <small>{data.work.total} work items in your scope</small>
            </Card>
            <Card title="Support needed">
              <div className="stat-value">{data.work.blocked}</div>
              <small>{data.work.overdue} active items past due</small>
            </Card>
            <Card title="On-time delivery">
              <div className="stat-value">
                {data.work.due_items
                  ? `${Math.round((100 * data.work.on_time) / data.work.due_items)}%`
                  : "—"}
              </div>
              <small>
                {data.work.due_items
                  ? `${data.work.on_time} of ${data.work.due_items} due items completed on time`
                  : "No work items have passed their due date"}
              </small>
            </Card>
            <Card title="Reviews finalised">
              <div className="stat-value">
                {data.reviews.finalised}
                <span className="stat-denominator">
                  {" "}
                  / {data.reviews.total}
                </span>
              </div>
              <small>{data.reviews.overdue} reviews past deadline</small>
            </Card>
          </div>
          <div className="split">
            <Card title="Work progress">
              <p className="chart-subtitle">
                Status of assigned outcomes · as of {data.as_of}
              </p>
              {data.work.total === 0 ? (
                <div className="animated-empty">
                  <ProgressScene />
                  <p>No work has been assigned yet.</p>
                </div>
              ) : (
                <div className="status-bars">
                  {data.work_status.map((x, i) => (
                    <div key={x.status}>
                      <span>{human(x.status)}</span>
                      <div className="bar-track">
                        <div
                          className={`bar-fill bar-${i}`}
                          style={{
                            width: `${(100 * x.total) / data.work.total}%`,
                          }}
                        />
                      </div>
                      <strong>{x.total}</strong>
                    </div>
                  ))}
                </div>
              )}
              <small>Operational progress, not a performance rating.</small>
            </Card>
            <Card title="Completed work over time">
              <p className="chart-subtitle">
                Last six months with recorded completions
              </p>
              {data.completed_by_month.length === 0 ? (
                <div className="animated-empty">
                  <ProgressScene launch />
                  <p>Your first completed outcome will appear here.</p>
                </div>
              ) : (
                <div
                  className="column-chart"
                  role="img"
                  aria-label={data.completed_by_month
                    .map((m) => `${m.month.slice(0, 7)}: ${m.total} completed`)
                    .join("; ")}
                >
                  {data.completed_by_month.map((m) => (
                    <div key={m.month}>
                      <strong>{m.total}</strong>
                      <span
                        className="chart-column"
                        style={{
                          height: `${Math.max(4, (140 * m.total) / Math.max(...data.completed_by_month.map((n) => n.total)))}px`,
                        }}
                      />
                      <small>
                        {new Date(m.month).toLocaleDateString(undefined, {
                          month: "short",
                          year: "2-digit",
                        })}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
          <div className="split">
            <section className="review-banner">
              <p className="eyebrow">YOUR NEXT CHAPTER</p>
              <h2>
                Contribute to purpose.
                <br />
                Leave a lasting impact.
              </h2>
              <p>
                Make outcomes visible. Reflect with context. Agree what comes
                next.
              </p>
              <Link
                className="button neutral"
                href={
                  role === "hr" ? "/hr/review-cycles" : `/${role}/development`
                }
              >
                {role === "hr" ? "Manage cycles" : "Open development"}
              </Link>
            </section>
            <Card title="Review journey">
              {data.next_reviews.length === 0 ? (
                <p className="empty">No open reviews in this workspace.</p>
              ) : (
                data.next_reviews.map((r) => (
                  <div className="history-row" key={r.id}>
                    <Link href={`${base}/${r.id}`}>
                      {human(r.cycle__kind)} {r.cycle__year} →
                    </Link>
                    <small>
                      {human(r.state)} · Due {r.cycle__due_on}
                    </small>
                  </div>
                ))
              )}
            </Card>
          </div>
          <Card title="Work that needs support">
            {data.attention.length === 0 ? (
              <p>No blocked work is currently recorded in your scope.</p>
            ) : (
              data.attention.map((t) => (
                <div className="history-row" key={t.id}>
                  <Link
                    href={`/${role === "hr" ? "employee" : role}/tasks/${t.id}`}
                  >
                    {t.title} →
                  </Link>
                  <small>Due {t.due_date}</small>
                </div>
              ))
            )}
          </Card>
          {role === "hr" && (
            <Card title="Cycle progress by department">
              <div className="actions">
                <p>{data.people} active people</p>
                <a
                  className="button neutral"
                  href="/api/v1/reports/reviews.csv"
                >
                  Download review progress CSV
                </a>
              </div>
              {data.departments.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th>Review stage</th>
                        <th>Reviews</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.departments.map((d, i) => (
                        <tr key={i}>
                          <td>
                            {d.employee__department__name ||
                              "Unassigned department"}
                          </td>
                          <td>{human(d.state)}</td>
                          <td>{d.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No cycles have been launched.</p>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}
