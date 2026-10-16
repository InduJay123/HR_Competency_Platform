"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { api, post, allPages, ApiError } from "@/lib/api";
import type { Page } from "@/lib/types";
import { human, type Commitment, type Evidence } from "@/lib/reviews";
import { Badge, Button, Card, Feedback, Loading } from "./ui";
import { useSession } from "./shell";
import {
  DevelopmentFilters,
  type FollowUpFilters,
} from "./development-filters";
import styles from "./development.module.css";
export type FollowUpCommitment = Commitment & {
  employee_details: {
    id: string;
    name: string;
    designation: string;
    department: string;
    photo_url: string;
  };
  owner_name: string;
  overdue: boolean;
};
type DevelopmentPage = Page<FollowUpCommitment> & {
  summary: Record<string, number>;
  as_of: string;
};
export function CommitmentCard({
  item,
  reload,
}: {
  item: FollowUpCommitment;
  reload: () => void;
}) {
  const [status, setStatus] = useState(item.status),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [evidence, setEvidence] = useState<Evidence[]>([]),
    [ids, setIds] = useState<string[]>([]),
    [history, setHistory] = useState<
      | {
          id: string;
          notes: string;
          status: string;
          created_at: string;
          evidence_ids: string[];
        }[]
      | null
    >(null);
  async function loadDetails() {
    try {
      const [updates, sources] = await Promise.all([
        api<NonNullable<typeof history>>(`development/${item.id}/history/`),
        allPages<Evidence>(`evidence/?employee=${item.employee}`),
      ]);
      setHistory(updates);
      setEvidence(sources);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function createWork() {
    setBusy(true);
    setError("");
    try {
      await post(`development/${item.id}/create-work/`, {});
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await post(`development/${item.id}/progress/`, {
        version: item.version,
        status,
        notes,
        evidence_ids: ids,
      });
      setNotes("");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <div className={styles.identity}>
        {item.employee_details.photo_url && (
          <Image
            src={item.employee_details.photo_url}
            alt={`${item.employee_details.name}'s profile`}
            width={44}
            height={44}
            unoptimized
          />
        )}
        <div>
          <strong>{item.employee_details.name}</strong>
          <p>
            {[
              item.employee_details.designation || "Steward Guy",
              item.employee_details.department,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {item.owner !== item.employee && (
        <p className={styles.owner}>Commitment owner: {item.owner_name}</p>
      )}
      <h2 className={styles.title}>{item.action}</h2>
      <div className={styles.status}>
        <Badge>{human(item.status)}</Badge>
        <strong>
          {item.overdue ? "Overdue · " : ""}Due{" "}
          {new Date(`${item.due_date}T12:00:00`).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </strong>
      </div>
      <p>
        <strong>Success:</strong> {item.success_measure}
      </p>
      <p>
        <strong>Manager support:</strong> {item.manager_support}
      </p>
      <p>
        <Link href={`/employee/reviews/${item.review}`}>
          Original agreed record
        </Link>
      </p>
      {item.work_item ? (
        <p>
          <Link href={`/employee/tasks/${item.work_item}`}>
            Open linked development work
          </Link>
        </p>
      ) : item.can_create_work ? (
        <Button variant="neutral" disabled={busy} onClick={createWork}>
          Assign as development work
        </Button>
      ) : null}
      <Feedback error={error} />
      <details
        onToggle={(event) => {
          if (event.currentTarget.open && history === null) void loadDetails();
        }}
      >
        <summary>Progress history and follow-up</summary>
        {history === null ? (
          <p>Loading follow-up…</p>
        ) : history.length ? (
          history.map((update) => (
            <article key={update.id} className="card">
              <Badge>{human(update.status)}</Badge>
              <p>{update.notes}</p>
              <small>
                {new Date(update.created_at).toLocaleString()} ·{" "}
                {update.evidence_ids.length} evidence item(s)
              </small>
            </article>
          ))
        ) : (
          <p>No follow-up recorded yet.</p>
        )}
        {item.can_update && (
          <>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {[
                  "NOT_STARTED",
                  "IN_PROGRESS",
                  "SUPPORT_NEEDED",
                  "COMPLETE",
                ].map((s) => (
                  <option key={s} value={s}>
                    {human(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Progress, evidence or support needed
              <textarea
                value={notes}
                maxLength={10000}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Link authorised work evidence</legend>
              {evidence.length ? (
                evidence.map((source) => (
                  <label key={source.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(source.id)}
                      onChange={(event) =>
                        setIds(
                          event.target.checked
                            ? [...ids, source.id]
                            : ids.filter((id) => id !== source.id),
                        )
                      }
                    />
                    {source.title} · {human(source.validation)}
                  </label>
                ))
              ) : (
                <p>Add evidence to the Steward Guy’s work item first.</p>
              )}
            </fieldset>
            <Button disabled={busy || !notes.trim()} onClick={save}>
              Save progress
            </Button>
          </>
        )}
      </details>
    </Card>
  );
}
export function Development({ team = false }: { team?: boolean }) {
  const session = useSession();
  return (
    <DevelopmentWorkspace key={`${session.company_id}:${team}`} team={team} />
  );
}
function DevelopmentWorkspace({ team }: { team: boolean }) {
  const [filters, setFilters] = useState<FollowUpFilters>({
    search: "",
    employee: "",
    status: "",
    department: "",
    due: "",
  });
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, value);
  return (
    <div className={styles.workspace}>
      <h1>Development follow-up</h1>
      <p className="subtitle">
        Turn agreed commitments into progress, with clear ownership and manager
        support.
      </p>
      {team && (
        <DevelopmentFilters
          value={filters}
          onChange={(value) => {
            setFilters(value);
            setPage(1);
          }}
        />
      )}
      <CommitmentResults
        key={params.toString()}
        query={params.toString()}
        page={page}
        onPage={setPage}
        filters={filters}
      />
    </div>
  );
}
function CommitmentResults({
  query,
  page,
  onPage,
  filters,
}: {
  query: string;
  page: number;
  onPage: (page: number) => void;
  filters: FollowUpFilters;
}) {
  const [data, setData] = useState<DevelopmentPage | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    api<DevelopmentPage>(`development/?${query}`)
      .then((value) => {
        if (alive) {
          setData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404 && page > 1)
          onPage(page - 1);
        else setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [query, refresh, page, onPage]);
  const filtered = Object.values(filters).some(Boolean);
  return (
    <>
      <Feedback error={error} />
      {data && (
        <div
          className={styles.summary}
          aria-label="Commitment counts for current filters"
        >
          <strong>
            {data.summary.total}{" "}
            {data.summary.total === 1 ? "commitment" : "commitments"}
          </strong>
          {["NOT_STARTED", "IN_PROGRESS", "SUPPORT_NEEDED", "COMPLETE"].map(
            (s) => (
              <span key={s}>
                {data.summary[s]} {human(s)}
              </span>
            ),
          )}
          <small>All matching results · As of {data.as_of}</small>
        </div>
      )}
      {!data ? (
        !error && <Loading />
      ) : !data.count ? (
        <Card>
          <p>
            {filters.employee &&
            !filters.search &&
            !filters.status &&
            !filters.department &&
            !filters.due
              ? "No development commitments are recorded for this Steward Guy."
              : filtered
                ? "No commitments match these filters."
                : "No development commitments are available."}
          </p>
        </Card>
      ) : (
        <>
          {data.results.map((c) => (
            <CommitmentCard
              key={`${c.id}-${c.version}`}
              item={c}
              reload={() => setRefresh((n) => n + 1)}
            />
          ))}
          <div className="paging">
            <Button
              variant="neutral"
              disabled={!data.previous}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="neutral"
              disabled={!data.next}
              onClick={() => onPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </>
  );
}
