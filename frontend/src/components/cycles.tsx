"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, allPages, post } from "@/lib/api";
import type { Page } from "@/lib/types";
import { human, type Cycle, type PillarTarget } from "@/lib/reviews";
import { TargetSetup } from "./pillar-targets";
import { Button, Card, Feedback, Loading } from "./ui";
type Preview = {
  people: { id: string; name: string; has_manager: boolean }[];
  reviewers: { id: string; name: string }[];
};
export function Cycles() {
  const [rows, setRows] = useState<Page<Cycle> | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Cycle | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [reviewer, setReviewer] = useState(""),
    [page, setPage] = useState(1);
  const reload = () =>
    api<Page<Cycle>>(`review-cycles/?page=${page}`).then(setRows);
  useEffect(() => {
    api<Page<Cycle>>(`review-cycles/?page=${page}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [page]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await post("review-cycles/", { ...values, year: Number(values.year) });
      form.reset();
      await reload();
      setSuccess("Cycle saved. Preview participants before launch.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(c: Cycle) {
    setError("");
    try {
      const result = await api<Preview>(`review-cycles/${c.id}/preview/`);
      setPreview(result);
      setSelected(c);
      const targets = c.workflow_version === 2 ? await allPages<PillarTarget>(`pillar-targets/?cycle=${c.id}`) : [];
      setIds([...new Set(targets.map(t => t.employee))]);
      setReviewer(result.reviewers.length === 1 ? result.reviewers[0].id : "");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function launch() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await post(`review-cycles/${selected.id}/launch/`, {
        employee_ids: ids,
        reviewer_id: reviewer,
      });
      setSelected(null);
      setPreview(null);
      await reload();
      setSuccess("Cycle launched. Steward Guys have been notified.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const cycle = await post<Cycle>(`review-cycles/${selected.id}/start/`, {});
      await inspect(cycle); await reload(); setSuccess("Cycle started. Steward Guys can link Growth Tools evidence to their targets.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <>
      <h1>Review cycles</h1>
      <p className="subtitle">
        Mid-Year and Year-End. Confirm readiness, ownership and the appointed
        Chief Steward.
      </p>
      <Feedback error={error} success={success} />
      <Card title="Create a cycle">
        <form onSubmit={create}>
          <div className="form-grid">
            <label>
              Year
              <input
                name="year"
                type="number"
                min="2000"
                max="2200"
                defaultValue={new Date().getFullYear()}
                required
              />
            </label>
            <label>
              Cycle
              <select name="kind">
                <option value="MID_YEAR">Mid-Year · January–June</option>
                <option value="YEAR_END">Year-End · July–December</option>
              </select>
            </label>
            <label>
              Period starts
              <input name="starts_on" type="date" required />
            </label>
            <label>
              Period ends
              <input name="ends_on" type="date" required />
            </label>
            <label>
              Submission due
              <input name="due_on" type="date" required />
            </label>
          </div>
          <Button disabled={busy}>Save cycle</Button>
        </form>
      </Card>
      {preview && selected && (
        <Card title={`${human(selected.kind)} ${selected.year} — target setup and review opening`}>
          {selected.workflow_version === 2 && <TargetSetup cycle={selected} people={preview.people} onSaved={() => inspect(selected)} />}
          {selected.workflow_version !== 2 && <p>This existing cycle keeps its original review forms. New cycles use individual pillar targets.</p>}
          <p>
            Chief Steward appraises every participant. Year-End also requires
            their final Mid-Year record. Chief Steward cannot appraise themselves.
          </p>
          <p>Appointed Chief Steward: {preview.reviewers.find((r) => r.id === reviewer)?.name || "Unavailable"}</p>
          {selected.workflow_version !== 2 && <fieldset>
            <legend>Choose participants</legend>
            {preview.people.map((p) => (
              <label className="check-label" key={p.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(p.id)}
                  disabled={!p.has_manager}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, p.id]
                        : ids.filter((i) => i !== p.id),
                    )
                  }
                />
                {p.name}
                {!p.has_manager ? " · Reporting manager required" : ""}
              </label>
            ))}
          </fieldset>}
          <div className="actions">
            {selected.workflow_version === 2 && !selected.started_at && <Button disabled={busy || !ids.length} onClick={start}>Start cycle</Button>}
            {!selected.launched_at && (selected.workflow_version !== 2 || selected.started_at) && <Button
              disabled={busy || !ids.length || !reviewer}
              onClick={launch}
            >
              Open formal reviews for {ids.length} Steward Guys
            </Button>}
            <Button variant="neutral" onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
      <Card title="Cycle history">
        {!rows ? (
          <Loading />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Cycle</th>
                    <th>Period</th>
                    <th>Deadline</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.results.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {human(c.kind)} {c.year}
                      </td>
                      <td>
                        {c.starts_on} → {c.ends_on}
                      </td>
                      <td>{c.due_on}</td>
                      <td>
                        <Button variant="neutral" onClick={() => inspect(c)}>
                          {c.launched_at ? "Reviews open — view targets" : c.started_at ? "Cycle active — targets / open reviews" : "Set targets and start"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="paging">
              <Button
                variant="neutral"
                disabled={!rows.previous}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                variant="neutral"
                disabled={!rows.next}
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
