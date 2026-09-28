"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Page, Employee } from "@/lib/types";
import { human, type Review } from "@/lib/reviews";
import { useSession } from "./shell";
import { Badge, Button, Card, Feedback, Loading } from "./ui";

export function ReviewList({
  scope = "employee",
  history = false,
}: {
  scope?: "employee" | "manager" | "hr" | "approvals";
  history?: boolean;
}) {
  const session = useSession();
  const [data, setData] = useState<Page<Review> | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [state, setState] = useState(history ? "FINALISED" : "");
  useEffect(() => {
    let alive = true;
    async function load() {
      const p = await api<Employee>("auth/profile/");
      let q = `reviews/?page=${page}&state=${state}`;
      if (scope === "employee") q += `&employee=${p.id}`;
      if (scope === "manager") q += `&manager=${p.id}`;
      if (scope === "approvals") q += "&appointed=true";
      const r = await api<Page<Review>>(q);
      if (alive) setData(r);
    }
    load().catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [page, state, scope, session.company_id]);
  return (
    <>
      <p className="eyebrow">STEWARDSHIP EVALUATION</p>
      <div className="page-heading">
        <div>
          <h1>
            {history
              ? "Review History"
              : scope === "employee"
                ? "My evaluation"
                : scope === "manager"
                  ? "Reviews I conduct"
                  : scope === "approvals"
                    ? "My approvals"
                    : "Review oversight"}
          </h1>
          <p className="subtitle">
            Connect contribution, evidence and the support that moves work
            forward.
          </p>
        </div>
        {scope === "hr" && (
          <Link className="button primary" href="/hr/review-cycles">
            Manage review cycles
          </Link>
        )}
      </div>
      <div className="review-banner">
        <strong>Work → reflection → conversation → improvement</strong>
        <p>
          Two formal reviews a year. Evidence-led conversations. Human
          decisions.
        </p>
      </div>
      <Feedback error={error} />
      <Card title="Your review workspace">
        {!history && (
          <label className="filter-label">
            Status
            <select
              value={state}
              onChange={(e) => {
                setPage(1);
                setState(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              {[
                "OPEN",
                "PREPARING",
                "SUBMITTED",
                "ACKNOWLEDGEMENT_PENDING",
                "REVISION_REQUESTED",
                "FINALISED",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {!data ? (
          <Loading />
        ) : data.count === 0 ? (
          <p className="empty">
            No reviews match this view. HR opens Mid-Year and Year-End cycles
            after confirming reporting relationships.
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Employee / responsibility</th>
                    <th>Cycle</th>
                    <th>Due</th>
                    <th>Stage</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.employee_name}</strong>
                        <small>
                          {r.senior_leader
                            ? "Senior leadership evaluation"
                            : `Manager · ${r.manager_name}`}
                        </small>
                      </td>
                      <td>
                        {human(r.cycle_detail.kind)} {r.cycle_detail.year}
                      </td>
                      <td>{r.cycle_detail.due_on}</td>
                      <td>
                        <Badge>{human(r.state)}</Badge>
                      </td>
                      <td>
                        <Link
                          href={`/${scope === "approvals" ? "hr" : scope}/reviews/${r.id}`}
                        >
                          Open review →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="paging">
              <Button
                variant="neutral"
                disabled={!data.previous}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>
                {data.count} reviews · Page {page}
              </span>
              <Button
                variant="neutral"
                disabled={!data.next}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
