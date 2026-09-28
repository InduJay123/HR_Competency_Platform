"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, post, allPages } from "@/lib/api";
import type { Page } from "@/lib/types";
import { human, type Commitment, type Evidence } from "@/lib/reviews";
import { Badge, Button, Card, Feedback, Loading } from "./ui";
function Action({ item, reload }: { item: Commitment; reload: () => void }) {
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
    <Card title={item.action}>
      <Badge>{human(item.status)}</Badge>
      <p>
        <strong>Success:</strong> {item.success_measure}
      </p>
      <p>
        <strong>Manager support:</strong> {item.manager_support}
      </p>
      <p>
        Due {item.due_date} ·{" "}
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
                <p>Add evidence to the employee’s work item first.</p>
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
export function Development() {
  const [data, setData] = useState<Page<Commitment> | null>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const reload = () =>
    api<Page<Commitment>>(`development/?page=${page}`)
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    api<Page<Commitment>>(`development/?page=${page}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [page]);
  return (
    <>
      <h1>Development follow-up</h1>
      <p className="subtitle">
        Turn agreed commitments into progress, with clear ownership and manager
        support.
      </p>
      <Feedback error={error} />
      {!data ? (
        <Loading />
      ) : !data.count ? (
        <Card title="Your next chapter">
          <p>
            Development commitments appear here after a review is finalised. The
            original agreement stays in the saved review.
          </p>
        </Card>
      ) : (
        <>
          {data.results.map((c) => (
            <Action key={`${c.id}-${c.version}`} item={c} reload={reload} />
          ))}
          <div className="paging">
            <Button
              variant="neutral"
              disabled={!data.previous}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
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
    </>
  );
}
