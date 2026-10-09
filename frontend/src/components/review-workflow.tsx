"use client";
import { useState } from "react";
import { post } from "@/lib/api";
import { OVERALL, type Review, type Commitment } from "@/lib/reviews";
import { Badge, Button, Card, Feedback } from "./ui";

export function ReviewWorkflow({ review, role, hr, onSaved }: {
  review: Review; role: "employee" | "manager" | null; hr: boolean; onSaved: () => Promise<void>;
}) {
  const workflow = review.workflow;
  const marks = workflow?.confirmations;
  const locked = review.state === "FINALISED";
  const editable = !!role && !locked && !!workflow?.conversation_complete && !workflow.commitments_complete && !review.employee_ack && !review.manager_ack;
  const empty = { owner: review.employee, action: "", due_date: "", success_measure: "", manager_support: "" };
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overall, setOverall] = useState(review.hr_assessment?.overall || "");
  const [rationale, setRationale] = useState(review.hr_assessment?.rationale || "");
  async function act(path: string, data = {}) {
    setBusy(true); setError("");
    try {
      await post(`reviews/${review.id}/${path}/`, { version: review.version, ...data });
      await onSaved();
      if (path === "commitments") { setEditing(undefined); setDraft(empty); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function edit(item: Commitment) {
    setEditing(item.id);
    setDraft({ owner: item.owner_id || item.owner, action: item.action, due_date: item.due_date,
      success_measure: item.success_measure, manager_support: item.manager_support });
  }
  return <>
    <Feedback error={error} />
    <Card title="Human conversation">
      <p>Employee and assigned manager each confirm their own participation.</p>
      <dl className="record-fields">{(["employee", "manager"] as const).map(person =>
        <div key={person}><dt>{person === "employee" ? "Employee" : "Manager"}</dt>
          <dd><Badge>{marks?.[`${person}_participation`] ? "Participated" : "Pending"}</Badge></dd></div>)}</dl>
      {workflow?.ai_coaching !== "Complete" && <p className="alert">Available after both submissions and AI coaching are complete.</p>}
      {role && !locked && !marks?.[`${role}_participation`] && <Button
        disabled={busy || workflow?.ai_coaching !== "Complete" || !workflow?.employee_submitted || !workflow.manager_submitted}
        onClick={() => act("conversation")}>Confirm Participation</Button>}
    </Card>
    <Card title="Commitments">
      <p>One shared action plan, agreed by the employee and assigned manager.</p>
      <Badge>{workflow?.commitments_complete ? "Complete" : "Pending"}</Badge>
      {!workflow?.conversation_complete && <p className="alert">Editing unlocks after both people confirm conversation participation.</p>}
      {review.commitments?.map(item => <div className="evidence-row" key={item.id}>
        <h3>{item.action}</h3><p>Owner: {(item.owner_id || item.owner) === review.employee ? review.employee_name : review.manager_name}</p>
        <p>Success measure: {item.success_measure}</p><p>Support needed: {item.manager_support}</p><p>Due {item.due_date}</p>
        {editable && <Button variant="neutral" disabled={busy} onClick={() => edit(item)}>Edit commitment</Button>}
      </div>)}
      {editable && <form onSubmit={event => { event.preventDefault(); void act("commitments", { commitment: draft, ...(editing ? { commitment_id: editing } : {}) }); }}>
        <fieldset disabled={busy}><legend>{editing ? "Edit commitment" : "Add commitment"}</legend>
          <label>Action<input required maxLength={4000} value={draft.action} onChange={e => setDraft({ ...draft, action: e.target.value })} /></label>
          <label>Owner<select value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })}>
            <option value={review.employee}>{review.employee_name}</option><option value={review.manager}>{review.manager_name}</option>
          </select></label>
          <label>Due date<input required type="date" value={draft.due_date} onChange={e => setDraft({ ...draft, due_date: e.target.value })} /></label>
          <label>Success measure<input required maxLength={4000} value={draft.success_measure} onChange={e => setDraft({ ...draft, success_measure: e.target.value })} /></label>
          <label>Support needed<input required maxLength={4000} value={draft.manager_support} onChange={e => setDraft({ ...draft, manager_support: e.target.value })} /></label>
          <div className="actions"><Button type="submit">Save commitment</Button>
            {editing && <Button type="button" variant="neutral" onClick={() => { setEditing(undefined); setDraft(empty); }}>Cancel edit</Button>}</div>
        </fieldset>
      </form>}
      <p>Employee: {marks?.employee_commitments ? "Confirmed" : "Pending"} · Manager: {marks?.manager_commitments ? "Confirmed" : "Pending"}</p>
      {editable && <p>Save changes before confirming. Any edit clears prior agreement so both people confirm the same plan.</p>}
      {role && !locked && !marks?.[`${role}_commitments`] && <Button disabled={busy || !editable || !review.commitments?.length || !!editing || !!draft.action}
        onClick={() => act("confirm-commitments")}>Confirm Commitments</Button>}
      {workflow?.commitments_complete && <p>The agreed plan is locked. Contact Head of HR to request a revision.</p>}
    </Card>
    <Card title="Final human assessment">
      {hr && !locked && !review.employee_ack && !review.manager_ack ? <>
        <p>Head of HR records this assessment. AI coaching is advisory only.</p>
        <label>Overall assessment<select value={overall} onChange={e => setOverall(e.target.value)}>
          <option value="">Choose descriptor</option>{OVERALL.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Human assessment rationale<textarea maxLength={20000} value={rationale} onChange={e => setRationale(e.target.value)} /></label>
        <Button disabled={busy || !overall || !rationale.trim() || !workflow?.employee_submitted || !workflow.manager_submitted}
          onClick={() => act("human-assessment", { assessment: { overall, rationale } })}>Save human assessment</Button>
      </> : <><h3>{review.hr_assessment?.overall || "Pending"}</h3><p>{review.hr_assessment?.rationale}</p></>}
    </Card>
  </>;
}
