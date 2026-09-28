"use client";
import { EvidencePanel } from "./evidence";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, post, allPages } from "@/lib/api";
import type { Employee, Page, Work, WorkUpdate } from "@/lib/types";
import { useSession } from "./shell";
import { Badge, Button, Card, Feedback, Loading } from "./ui";
import { Help } from "./help";

export function WorkList({
  team = false,
  initialStatus = "",
}: {
  team?: boolean;
  initialStatus?: string;
}) {
  const [data, setData] = useState<Page<Work> | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState(initialStatus),
    [page, setPage] = useState(1);
  const load = useCallback(() => {
    api<Page<Work>>(
      `tasks/${team ? "team" : "my-tasks"}/?page=${page}&status=${status}`,
    )
      .then(setData)
      .catch((e) => setError(e.message));
  }, [team, page, status]);
  useEffect(load, [load]);
  return (
    <>
      <p className="eyebrow">WORK / ACCOUNTABILITY</p>
      <h1>{team ? "Team work" : "My work"}</h1>
      <p className="subtitle">
        Keep outcomes moving. Share progress and ask for support early.
      </p>
      <div className="toolbar">
        <select
          aria-label="Filter work status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All work</option>
          {["ASSIGNED", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
        {team && (
          <Link className="button primary" href="/manager/tasks/create">
            Assign work
          </Link>
        )}
      </div>
      <Feedback error={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        <Card>
          {data?.results.length ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Work / expected outcome</th>
                      <th>Owner</th>
                      <th>Due date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <Link
                            href={`/${team ? "manager" : "employee"}/tasks/${w.id}`}
                          >
                            {w.title}
                          </Link>
                          <small>{w.expected_outcome}</small>
                          {w.parent_task && <small>Delegated work</small>}
                        </td>
                        <td>{w.assignee_name}</td>
                        <td>{w.due_date}</td>
                        <td>
                          <Badge>{w.status.replaceAll("_", " ")}</Badge>
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
                  Page {page} · {data.count} items
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
          ) : (
            <p className="empty">No work matches this view.</p>
          )}
        </Card>
      )}
    </>
  );
}
export function AssignWork({
  parentId,
  onSaved,
}: {
  parentId?: string;
  onSaved?: (work: Work) => void;
}) {
  const [people, setPeople] = useState<Employee[]>([]),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      allPages<Employee>("employees/"),
      api<Employee>("auth/profile/"),
    ])
      .then(([p, me]) => setPeople(p.filter((x) => x.manager_id === me.id)))
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    try {
      const w = await post<Work>(
        parentId ? `tasks/${parentId}/delegate/` : "tasks/",
        body,
      );
      setSuccess("Work assigned. The owner has been notified.");
      form.reset();
      onSaved?.(w);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={parentId ? "Delegate part of this work" : "Assign work"}>
      <p className="subtitle">
        Define the result you need, who owns it and when it is due.
        {parentId
          ? " Your accountability for the parent task stays unchanged."
          : ""}
      </p>
      {!people.length && (
        <p className="empty">
          No active direct reports are available. Ask HR to confirm your
          reporting relationships before assigning work.
        </p>
      )}
      <form onSubmit={submit}>
        <label>
          Title
          <input name="title" maxLength={180} required />
        </label>
        <label>
          Expected outcome
          <textarea name="expected_outcome" required />
        </label>
        <div className="form-grid">
          <label>
            Owner
            <select name="assigned_to" required>
              <option value="">Select a direct report</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input name="due_date" type="date" required />
          </label>
          <label>
            Priority
            <select name="priority" defaultValue="MEDIUM">
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
            </select>
          </label>
          <label>
            Work type
            <select name="type">
              <option value="WORK">Work</option>
              <option value="DEVELOPMENT">Development</option>
            </select>
          </label>
        </div>
        <label>
          Context
          <textarea name="description" />
        </label>
        <Button disabled={busy || !people.length}>Assign work</Button>
        <Feedback error={error} success={success} />
      </form>
    </Card>
  );
}
export function WorkDetail({ id }: { id: string }) {
  const [work, setWork] = useState<Work | null>(null),
    [updates, setUpdates] = useState<WorkUpdate[]>([]),
    [profile, setProfile] = useState<Employee | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [delegate, setDelegate] = useState(false);
  const s = useSession();
  const load = useCallback(() => {
    Promise.all([
      api<Work>(`tasks/${id}/`),
      api<Page<WorkUpdate>>(`tasks/${id}/updates/`),
      api<Employee>("auth/profile/"),
    ])
      .then(([w, u, p]) => {
        setWork(w);
        setUpdates(u.results);
        setProfile(p);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      ...Object.fromEntries(new FormData(e.currentTarget)),
      version: work?.version,
    };
    try {
      setWork(await post<Work>(`tasks/${id}/updates/`, body));
      setSuccess("Progress saved.");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function edit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    const { cancel, ...values } = fields;
    try {
      await api(`tasks/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          ...values,
          version: work?.version,
          ...(cancel === "on" ? { status: "CANCELLED" } : {}),
        }),
      });
      setSuccess(
        cancel === "on"
          ? "Assignment cancelled. Its history is preserved."
          : "Assignment updated.",
      );
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!work) return error ? <Feedback error={error} /> : <Loading />;
  const mine = work.assigned_to === profile?.id,
    closed = ["DONE", "CANCELLED"].includes(work.status);
  return (
    <>
      <p className="eyebrow">WORK / EXPECTED OUTCOME</p>
      <h1>{work.title}</h1>
      <p className="subtitle">
        {work.assignee_name} · Due {work.due_date}
      </p>
      <Feedback error={error} success={success} />
      <div className="split">
        <div>
          <Card title="Expected outcome">
            <Help label="Expected outcome">
              Describe the change or result you expect, rather than a list of
              activities.
            </Help>
            <p>{work.expected_outcome}</p>
            <p>{work.description}</p>
            <Badge>{work.status.replaceAll("_", " ")}</Badge>
            {work.parent_task && (
              <p>
                <Link href={`/employee/tasks/${work.parent_task}`}>
                  View parent assignment
                </Link>
              </p>
            )}
          </Card>
          <Card title="Progress and results">
            {updates.length ? (
              <ol className="timeline">
                {updates.map((u) => (
                  <li key={u.id}>
                    <Badge>{u.status}</Badge>
                    <small> {new Date(u.created_at).toLocaleString()}</small>
                    <p>{u.notes}</p>
                    {u.blocker && (
                      <p>
                        <strong>Blocker:</strong> {u.blocker}
                      </p>
                    )}
                    {u.next_step && (
                      <p>
                        <strong>Next step:</strong> {u.next_step}
                      </p>
                    )}
                    {u.result && (
                      <p>
                        <strong>Result:</strong> {u.result}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">
                No updates yet. Record the first step when work starts.
              </p>
            )}
          </Card>
        </div>
        {mine && !closed ? (
          <Card title="Share a progress update">
            <form onSubmit={submit}>
              <label>
                Status
                <select name="status">
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="BLOCKED">Blocked</option>
                  <option value="DONE">Done</option>
                </select>
              </label>
              <label>
                Progress notes
                <textarea name="notes" />
              </label>
              <label>
                Blocker
                <textarea name="blocker" />
              </label>
              <label>
                Next step
                <input name="next_step" />
              </label>
              <label>
                Result
                <textarea name="result" />
              </label>
              <small>
                A blocker is required for blocked work. A result is required to
                complete work.
              </small>
              <Button disabled={busy}>Save progress</Button>
            </form>
          </Card>
        ) : (
          <Card title="Accountability">
            <p>
              Progress is recorded by the assigned employee. The assigning
              manager remains able to follow the timeline.
            </p>
            {closed && <p>This assignment is closed.</p>}
          </Card>
        )}
      </div>
      {!closed &&
        work.assigned_by === profile?.id &&
        s.contexts?.includes("manager") && (
          <Card title="Manage this assignment">
            <details>
              <summary>Change outcome, priority or deadline</summary>
              <form key={work.version} onSubmit={edit}>
                <label>
                  Assignment title
                  <input
                    name="title"
                    defaultValue={work.title}
                    maxLength={180}
                    required
                  />
                </label>
                <label>
                  Expected outcome
                  <textarea
                    name="expected_outcome"
                    defaultValue={work.expected_outcome}
                    maxLength={5000}
                    required
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Due date
                    <input
                      name="due_date"
                      type="date"
                      defaultValue={work.due_date}
                      required
                    />
                  </label>
                  <label>
                    Priority
                    <select name="priority" defaultValue={work.priority}>
                      <option>LOW</option>
                      <option>MEDIUM</option>
                      <option>HIGH</option>
                    </select>
                  </label>
                </div>
                <label>
                  <input name="cancel" type="checkbox" /> Cancel this assignment
                  and preserve its history
                </label>
                <Button disabled={busy}>Save assignment changes</Button>
              </form>
            </details>
          </Card>
        )}
      {mine && !closed && s.contexts?.includes("manager") && (
        <>
          <Button variant="neutral" onClick={() => setDelegate(!delegate)}>
            {delegate ? "Close delegation" : "Delegate a part of this work"}
          </Button>
          {delegate && (
            <AssignWork parentId={id} onSaved={() => setDelegate(false)} />
          )}
        </>
      )}
      <EvidencePanel taskId={id} canAdd={mine} />
    </>
  );
}
