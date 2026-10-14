"use client";
import { useEffect, useState } from "react";
import { allPages, post } from "@/lib/api";
import { PILLARS, human, type Cycle, type PillarTarget } from "@/lib/reviews";
import { Button, Card, Feedback } from "./ui";

export function TargetSetup({ cycle, people, onSaved }: {
  cycle: Cycle; people: { id: string; name: string; has_manager: boolean }[]; onSaved: () => Promise<void>;
}) {
  const [employee, setEmployee] = useState("");
  const [rows, setRows] = useState<PillarTarget[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoaded(false); setError("");
    if (employee) allPages<PillarTarget>(`pillar-targets/?cycle=${cycle.id}&employee=${employee}`).then(data => {
      if (!alive) return;
      setRows(PILLARS.map(p => data.find(r => r.pillar === p.toUpperCase()) || {
        id: "", cycle: cycle.id, cycle_name: "", employee, employee_name: "", pillar: p.toUpperCase(),
        target: "", success_measure: "", notes: "", version: 0, completed_at: null,
      })); setLoaded(true);
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [cycle.id, employee]);
  async function save(complete: boolean) {
    setBusy(true); setError("");
    try {
      const saved = await post<PillarTarget[]>(`review-cycles/${cycle.id}/targets/`, {
        employee, complete, targets: rows.map(({ pillar, target, success_measure, notes, version }) => ({ pillar, target, success_measure, notes, version })),
      });
      setRows(PILLARS.map(p => saved.find(r => r.pillar === p.toUpperCase())!));
      await onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Card title="Individual pillar targets">
    <p>Set five individual targets. Changes are audited. Targets lock when formal reviews open.</p>
    <label>Employee<select value={employee} disabled={busy} onChange={e => setEmployee(e.target.value)}>
      <option value="">Choose employee</option>
      {people.filter(p => p.has_manager).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <Feedback error={error} />
    {loaded && <fieldset disabled={busy || !!cycle.launched_at}>
      {rows.map((row, i) => <div className="pillar" key={row.pillar}>
        <h3>{human(row.pillar)}</h3>
        {([['target', 'Target'], ['success_measure', 'Success measure'], ['notes', 'Expected behaviour / notes']] as const).map(([key, label]) =>
          <label key={key}>{human(row.pillar)} — {label}<textarea maxLength={6000} value={row[key]} onChange={e => setRows(rows.map((r, n) => n === i ? { ...r, [key]: e.target.value } : r))} /></label>)}
      </div>)}
      <p>{rows.every(r => r.completed_at) ? "Target setup complete" : "Draft target setup"}</p>
      {!cycle.launched_at && <div className="actions"><Button onClick={() => save(false)}>Save target draft</Button>
        <Button disabled={rows.some(r => !r.target.trim() || !r.success_measure.trim())} onClick={() => save(true)}>Complete target setup</Button></div>}
    </fieldset>}
  </Card>;
}

export function OwnTargets() {
  const [rows, setRows] = useState<PillarTarget[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { allPages<PillarTarget>("pillar-targets/?active=true&own=true").then(setRows).catch(e => setError(e.message)); }, []);
  return <Card title="My cycle targets"><Feedback error={error} />
    {!rows.length && <p>No active cycle targets yet.</p>}
    {rows.map(r => <div className="pillar" key={r.id}><h3>{r.cycle_name} · {human(r.pillar)}</h3><p>{r.target}</p><p>Success measure: {r.success_measure}</p><p>{r.notes}</p></div>)}
  </Card>;
}

