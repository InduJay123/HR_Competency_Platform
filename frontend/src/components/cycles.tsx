"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, post } from "@/lib/api";
import type { Page } from "@/lib/types";
import { human, type Cycle } from "@/lib/reviews";
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
      setPreview(await api<Preview>(`review-cycles/${c.id}/preview/`));
      setSelected(c);
      setIds([]);
      setReviewer("");
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
      setSuccess("Cycle launched. Employees have been notified.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Review cycles</h1>
      <p className="subtitle">
        Mid-Year and Year-End. Confirm readiness, ownership and the appointed
        Head of HR.
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
        <Card title={`Launch ${human(selected.kind)} ${selected.year}`}>
          <p>
            Each participant needs a reporting manager. Year-End also requires
            their final Mid-Year record. The appointed Head of HR must be
            independent of the employee.
          </p>
          <label>
            Appointed Head of HR
            <select
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            >
              <option value="">Choose reviewer</option>
              {preview.reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
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
          </fieldset>
          <div className="actions">
            <Button
              disabled={busy || !ids.length || !reviewer}
              onClick={launch}
            >
              Launch for {ids.length} employees
            </Button>
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
                        {c.launched_at ? (
                          "Launched"
                        ) : (
                          <Button variant="neutral" onClick={() => inspect(c)}>
                            Preview and launch
                          </Button>
                        )}
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
