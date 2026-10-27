"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, allPages, post } from "@/lib/api";
import type { Employee, Page } from "@/lib/types";
import { useSession } from "./shell";
import { Button, Card, Feedback, Loading } from "./ui";

type Kind = "CONTRIBUTION" | "CAPABILITY" | "LEGACY";
type Entry = {
  id: string;
  subject: string;
  kind: Kind;
  category: string;
  title: string;
  details: string;
  outcome: string;
  support: string;
  evidence_url: string;
  shared: boolean;
  archived: boolean;
  version: number;
  can_edit: boolean;
  perspective: string;
  owner_name: string;
  subject_name: string;
  subject_designation: string;
  created_at: string;
};
const specs = {
  CONTRIBUTION: {
    title: "Contributions and Evidence",
    copy: "Capture the difference you make, beyond a task list.",
    action: "Add contribution",
    categories: [
      "Mentoring",
      "Knowledge sharing",
      "Systems & culture",
      "Other contribution",
    ],
  },
  CAPABILITY: {
    title: "Capability Map",
    copy: "A living portrait of strengths, growth and shared support.",
    action: "Add observation",
    categories: [
      "Technical Expertise",
      "Relational Intelligence",
      "Strategic Judgment",
      "Emotional Cadence",
    ],
  },
  LEGACY: {
    title: "Legacy Tracker",
    copy: "What continues to create value because of your contribution?",
    action: "Record contribution",
    categories: ["People", "Knowledge", "Systems", "Culture"],
  },
};
export function TeamGrowth({
  initialSubject = "",
}: {
  initialSubject?: string;
}) {
  const session = useSession();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [error, setError] = useState("");
  const chief = !!session.contexts?.includes("manager");
  useEffect(() => {
    if (!chief) return;
    let alive = true;
    const query = initialSubject
      ? "&subject=" + encodeURIComponent(initialSubject)
      : "";
    allPages<Entry>("growth/?scope=team" + query)
      .then((rows) => {
        if (alive)
          setEntries(
            rows.filter((row) => row.shared && row.perspective === "SELF"),
          );
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [session.company_id, chief, initialSubject]);
  if (!chief) return <Feedback error="Chief Steward access is required." />;
  const filtered = (entries || []).filter(
    (entry) =>
      (!kind || entry.kind === kind) &&
      entry.subject_name
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const groups = new Map<string, Entry[]>();
  filtered.forEach((entry) =>
    groups.set(entry.subject, [...(groups.get(entry.subject) || []), entry]),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Growth Tools</h1>
          <p className="subtitle">
            Shared development activity from your Steward Associates.
          </p>
        </div>
      </div>
      {initialSubject && (
        <Link className="growth-back" href="/manager/growth">
          View all Steward Associates
        </Link>
      )}
      <div className="growth-toolbar">
        <label className="filter-label">
          Search Steward Associates
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
          />
        </label>
        <label className="filter-label">
          Growth area
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All growth areas</option>
            {(Object.keys(specs) as Kind[]).map((key) => (
              <option key={key} value={key}>
                {specs[key].title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Feedback error={error} />
      {!entries ? (
        !error && <Loading />
      ) : !entries.length ? (
        <Card title="Shared Growth Tools">
          <p>No Growth Tools have been shared with you yet.</p>
        </Card>
      ) : !filtered.length ? (
        <Card title="No matching entries">
          <p>Try another Steward Associate name or growth area.</p>
        </Card>
      ) : (
        Array.from(groups, ([subject, rows]) => (
          <section key={subject} className="growth-person-group">
            <div className="page-heading">
              <div>
                <h2>{rows[0].subject_name}</h2>
                <p className="subtitle">{rows[0].subject_designation}</p>
              </div>
            </div>
            <div className="growth-grid">
              {rows.map((entry) => (
                <article key={entry.id} className="growth-entry">
                  <p className="eyebrow">
                    {specs[entry.kind].title} ? {entry.category}
                  </p>
                  <small>
                    <time dateTime={entry.created_at}>
                      {new Date(entry.created_at).toLocaleDateString()}
                    </time>
                  </small>
                  <h3>{entry.title}</h3>
                  <p className="growth-copy">{entry.details}</p>
                  {entry.outcome && (
                    <>
                      <small>
                        {entry.kind === "CAPABILITY"
                          ? "DEVELOPMENT OPPORTUNITY"
                          : "WHAT CHANGED / WHO BENEFITED"}
                      </small>
                      <p className="growth-copy">{entry.outcome}</p>
                    </>
                  )}
                  {entry.support && (
                    <>
                      <small>SUPPORT AND NEXT STEP</small>
                      <p className="growth-copy">{entry.support}</p>
                    </>
                  )}
                  <div className="growth-entry-footer">
                    <small>Shared with Chief Steward</small>
                    {entry.evidence_url && (
                      <a
                        href={entry.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open linked evidence
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}

export function GrowthHub({
  onSelect,
}: { onSelect?: (kind: Kind) => void } = {}) {
  const session = useSession();
  if (session.contexts?.includes("manager")) return <TeamGrowth />;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Growth tools</h1>
          <p className="subtitle">
            Make your contribution visible. Build capability. Leave something
            lasting.
          </p>
        </div>
      </div>
      <div className="growth-grid">
        {(Object.keys(specs) as Kind[]).map((k, i) => (
          <Card key={k} title={specs[k].title}>
            <p>{specs[k].copy}</p>
            {onSelect ? (
              <Button variant="neutral" onClick={() => onSelect(k)}>
                Open {specs[k].title}
              </Button>
            ) : (
              <Link
                className="button neutral"
                href={
                  [
                    "/employee/contributions",
                    "/employee/capability",
                    "/employee/legacy",
                  ][i]
                }
              >
                Open {specs[k].title}
              </Link>
            )}
          </Card>
        ))}
      </div>
      {!onSelect && (
        <>
          <div className="review-banner">
            <strong>Capture your growth and contribution</strong>
            <p>
              Use these independent tools to record your development. Private
              records remain private unless you choose to share them.
            </p>
            <Link href="/employee/reviews">Open My Review →</Link>
          </div>
          <Link href="/employee/review-history">
            Review History and Mid-Year / Year-End comparison →
          </Link>
        </>
      )}
    </>
  );
}

export function GrowthPage({
  kind,
  teamSubject,
  onBack,
}: {
  kind: Kind;
  teamSubject?: string;
  onBack?: () => void;
}) {
  const session = useSession();
  if (session.contexts?.includes("manager"))
    return <TeamGrowth initialSubject={teamSubject} />;
  return (
    <PersonalGrowthPage kind={kind} teamSubject={teamSubject} onBack={onBack} />
  );
}

function PersonalGrowthPage({
  kind,
  teamSubject,
  onBack,
}: {
  kind: Kind;
  teamSubject?: string;
  onBack?: () => void;
}) {
  const session = useSession(),
    spec = specs[kind];
  const [data, setData] = useState<Page<Entry> | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Entry | null | undefined>(),
    [category, setCategory] = useState(""),
    [perspective, setPerspective] = useState("SELF"),
    [page, setPage] = useState(1),
    [archived, setArchived] = useState(false),
    [people, setPeople] = useState<Employee[]>([]),
    [subject, setSubject] = useState(teamSubject || ""),
    [self, setSelf] = useState(""),
    [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (teamSubject) return;
    api<Employee>("auth/profile/")
      .then(async (me) => {
        const all = await allPages<Employee>("employees/");
        setPeople(all.filter((p) => p.id === me.id || p.manager_id === me.id));
        setSubject(me.id);
        setSelf(me.id);
      })
      .catch((e) => setError(e.message));
  }, [session.company_id, teamSubject]);
  useEffect(() => {
    if (!subject) return;
    let alive = true;
    api<Page<Entry>>(
      `growth/?kind=${kind}&subject=${subject}&page=${page}&archived=${archived}&category=${encodeURIComponent(category)}&perspective=${kind === "CAPABILITY" ? perspective : ""}${teamSubject ? "&scope=team" : ""}`,
    )
      .then((x) => {
        if (alive) setData(x);
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [
    kind,
    subject,
    page,
    archived,
    revision,
    category,
    perspective,
    teamSubject,
  ]);
  useEffect(() => {
    if (editing !== undefined) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const fd = new FormData(e.currentTarget);
    const body = {
      ...Object.fromEntries(fd),
      subject,
      kind,
      shared: fd.get("shared") === "on",
      version: editing?.version,
    };
    try {
      const saved = editing
        ? await api<Entry>(`growth/${editing.id}/`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await post<Entry>("growth/", body);
      if (kind === "CAPABILITY") setPerspective(saved.perspective);
      setPage(1);
      setEditing(undefined);
      setRevision((x) => x + 1);
      setSuccess("Your growth record has been saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive(entry: Entry) {
    setBusy(true);
    setError("");
    try {
      await api(`growth/${entry.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          version: entry.version,
          archived: !entry.archived,
        }),
      });
      setRevision((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const entries = (data?.results || []).filter(
    (x) =>
      (!category || x.category === category) &&
      (kind !== "CAPABILITY" || x.perspective === perspective),
  );
  const canAdd = !teamSubject;
  function item(x: Entry) {
    return (
      <article key={x.id} className="growth-entry">
        <p className="eyebrow">{x.category}</p>
        <small>
          {new Date(x.created_at).toLocaleDateString()} · {x.owner_name}
        </small>
        <h2>{x.title}</h2>
        <p className="growth-copy">{x.details}</p>
        {x.outcome && (
          <>
            <small>
              {kind === "CAPABILITY"
                ? "DEVELOPMENT EDGE"
                : "WHAT CHANGED / WHO BENEFITED"}
            </small>
            <p>{x.outcome}</p>
          </>
        )}
        {x.support && (
          <>
            <small>SUPPORT AND NEXT STEP</small>
            <p>{x.support}</p>
          </>
        )}
        <div className="growth-entry-footer">
          {x.evidence_url && (
            <a href={x.evidence_url} target="_blank" rel="noreferrer">
              Open linked evidence ↗
            </a>
          )}
          <small>
            {x.shared
              ? x.perspective === "MANAGER"
                ? "Shared with the Steward Associate"
                : "Shared with Chief Steward"
              : "Private"}{" "}
            ·{" "}
            {x.perspective === "MANAGER"
              ? "Chief Steward observation"
              : "Self reflection"}
          </small>
          {x.can_edit && (
            <div className="actions">
              <Button variant="neutral" onClick={() => setEditing(x)}>
                Edit
              </Button>
              <Button
                variant="neutral"
                disabled={busy}
                onClick={() => archive(x)}
              >
                {x.archived ? "Restore" : "Archive"}
              </Button>
            </div>
          )}
        </div>
      </article>
    );
  }
  return (
    <>
      {onBack ? (
        <Button variant="neutral" onClick={onBack}>
          ← Growth tools
        </Button>
      ) : (
        <Link className="growth-back" href="/employee/growth">
          ← Growth tools
        </Link>
      )}
      <div className="page-heading">
        <div>
          <h1>{spec.title}</h1>
          <p className="subtitle">{spec.copy}</p>
        </div>
        {canAdd && (
          <Button
            disabled={!subject}
            onClick={() => {
              setError("");
              setEditing(null);
            }}
          >
            {spec.action}
          </Button>
        )}
      </div>
      {kind === "CAPABILITY" && people.length > 1 && (
        <label className="filter-label">
          Whose capability map?
          <select
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setPage(1);
            }}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <nav className="account-tabs growth-tabs" aria-label="Growth filters">
        {kind === "CAPABILITY" ? (
          <>
            <button
              aria-current={perspective === "SELF" ? "page" : undefined}
              onClick={() => {
                setPerspective("SELF");
                setPage(1);
              }}
            >
              Steward Associate perspective
            </button>
            <button
              aria-current={perspective === "MANAGER" ? "page" : undefined}
              onClick={() => {
                setPerspective("MANAGER");
                setPage(1);
              }}
            >
              Chief Steward perspective
            </button>
            <Link
              href={
                subject === self
                  ? "/employee/development"
                  : "/manager/development"
              }
            >
              Shared development
            </Link>
          </>
        ) : (
          ["", ...spec.categories].map((x) => (
            <button
              key={x}
              aria-current={category === x ? "page" : undefined}
              onClick={() => {
                setCategory(x);
                setPage(1);
              }}
            >
              {x || (kind === "LEGACY" ? "All domains" : "All contributions")}
            </button>
          ))
        )}
      </nav>
      <div className="growth-toolbar">
        <label className="check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setPage(1);
            }}
          />
          Show archived records
        </label>
        <span>{data?.count || 0} saved records</span>
      </div>
      <Feedback error={editing === undefined ? error : ""} success={success} />
      {kind === "LEGACY" && (
        <div className="dashboard-banner">
          <div>
            <h2>Contribution that continues beyond you</h2>
            <p>
              Record what others can carry forward: capability, knowledge,
              practices and trust.
            </p>
          </div>
        </div>
      )}
      {!data ? (
        error ? null : (
          <Loading />
        )
      ) : entries.length ? (
        <div className={`growth-grid ${kind.toLowerCase()}`}>
          {entries.map(item)}
        </div>
      ) : (
        <Card
          title={
            teamSubject
              ? "Shared Growth Tools"
              : "Your next contribution starts here"
          }
        >
          <p>
            {teamSubject
              ? "No Growth Tools records have been shared with you yet."
              : data.count
                ? "No records match this view."
                : "There are no saved records yet. Capture an example, the difference it made and any support needed."}
          </p>
          {canAdd && (
            <Button variant="neutral" onClick={() => setEditing(null)}>
              {spec.action}
            </Button>
          )}
        </Card>
      )}
      {!!data && (data.previous || data.next) && (
        <div className="paging">
          <Button
            variant="neutral"
            disabled={!data.previous}
            onClick={() => setPage((x) => x - 1)}
          >
            Previous
          </Button>
          <span>Page {page}</span>
          <Button
            variant="neutral"
            disabled={!data.next}
            onClick={() => setPage((x) => x + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <div className="review-banner">
        <strong>
          {kind === "LEGACY"
            ? "What is stronger because you were here?"
            : "Capture contribution, not just activity"}
        </strong>
        <p>
          Add who benefited, what changed, your role and the evidence that
          supports it. Growth Tools are independent from formal reviews.
        </p>
      </div>
      <dialog
        className="growth-dialog"
        aria-label={editing ? "Edit growth record" : spec.action}
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setEditing(undefined);
        }}
      >
        <div className="page-heading">
          <h2>{editing ? "Edit record" : spec.action}</h2>
          <Button
            variant="neutral"
            disabled={busy}
            onClick={() => setEditing(undefined)}
          >
            Close
          </Button>
        </div>
        <Feedback error={error} />
        {editing !== undefined && (
          <form key={editing?.id || "new"} onSubmit={save}>
            <label>
              Category
              <select
                name="category"
                defaultValue={editing?.category || spec.categories[0]}
              >
                {spec.categories.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                name="title"
                required
                maxLength={180}
                defaultValue={editing?.title}
              />
            </label>
            <label>
              {kind === "CAPABILITY"
                ? "Strength and supporting example"
                : "Your contribution and evidence"}
              <textarea
                name="details"
                required
                maxLength={6000}
                rows={4}
                defaultValue={editing?.details}
              />
            </label>
            <label>
              {kind === "CAPABILITY"
                ? "Development opportunity"
                : "What changed and who benefited"}
              <textarea
                name="outcome"
                maxLength={3000}
                rows={3}
                defaultValue={editing?.outcome}
              />
            </label>
            <label>
              Support and next step
              <textarea
                name="support"
                maxLength={3000}
                rows={2}
                defaultValue={editing?.support}
              />
            </label>
            <label>
              Evidence link
              <input
                type="url"
                name="evidence_url"
                placeholder="https://..."
                defaultValue={editing?.evidence_url}
              />
              <small>Use a link you are authorised to share.</small>
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="shared"
                defaultChecked={editing?.shared}
              />
              Share with Chief Steward
            </label>
            <small>
              Unchecked entries stay private. Share only what you want your
              Chief Steward to view.
            </small>
            <div className="actions">
              <Button disabled={busy}>
                {busy ? "Saving…" : "Save record"}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
