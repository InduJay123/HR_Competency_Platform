"use client";
import type { ReactNode } from "react";
import { human, type Review } from "@/lib/reviews";
import type { Analysis, State } from "./review-coach";
import { Badge, Button, Card, Feedback } from "./ui";
import styles from "./hr-review-presentation.module.css";

export { styles as hrReviewStyles };
export type CoachingSummary = {
  reviewId: string;
  round: number;
  accepted: boolean;
  status: string;
};

export function HrReviewFrame({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <div className={styles.workspace}>{children}</div> : <>{children}</>;
}

export function HrDisclosure({ enabled, label, children }: {
  enabled: boolean; label: string; children: ReactNode;
}) {
  return enabled ? <details><summary>{label}</summary>{children}</details> : <>{children}</>;
}

export function HrWorkflow({ review, coaching }: { review: Review; coaching?: CoachingSummary }) {
  const evidence = review.evidence || [];
  const rows = [
    ["Employee reflection", !review.forms ? "Not available" : review.forms.some((f) => f.kind === "EMPLOYEE" && f.submitted_at) ? "Complete" : "Not submitted"],
    ["Manager appraisal", !review.forms ? "Not available" : review.forms.some((f) => f.kind === "MANAGER" && f.submitted_at) ? "Complete" : "Not submitted"],
    ["Evidence validation", !review.evidence ? "Not available" : !evidence.length ? "No evidence supplied" : `${evidence.filter((e) => e.validation === "VALIDATED").length} validated · ${evidence.filter((e) => e.validation === "PENDING").length} pending`],
    ["AI coaching", coaching?.status || "Status not loaded"],
    ["Human conversation", review.conversation?.discussion ? "Recorded" : "Pending"],
    ["Commitments", review.commitments?.length ? `${review.commitments.length} recorded` : "Pending"],
    ["Acknowledgement", `Employee: ${review.employee_ack ? "acknowledged" : "pending"} · Manager: ${review.manager_ack ? "acknowledged" : "pending"}`],
    ["Final record", review.finalised_at ? "Finalised" : "Pending"],
  ];
  return <Card title="Review progress">
    <dl className={styles.progress}>
      {rows.map(([label, status]) => <div key={label}><dt>{label}</dt><dd>{status}</dd></div>)}
    </dl>
  </Card>;
}

function Guidance({ analysis, review }: { analysis: Analysis; review: Review }) {
  if (!analysis.output?.strengths) return null;
  const evidenceIds = new Set(review.evidence?.map((e) => e.id));
  return <>
    {([ ["strengths", "Strengths"], ["gaps", "Areas to discuss"], ["support_options", "Support options"] ] as const).map(([key, title]) =>
      <section key={key} className={styles.guidance}>
        <h3>{title}</h3>
        {analysis.output![key].map((item, index) => <div className="coaching-observation" key={index}>
          <p>{item.observation}</p>
          <p><strong>Discuss:</strong> {item.question}</p>
          {item.uncertainty && <p className={styles.muted}>{item.uncertainty}</p>}
          {item.source_ids.some((id) => evidenceIds.has(id)) && <small>Source: Validated evidence</small>}
        </div>)}
      </section>)}
    <section className={styles.guidance}>
      <h3>Limitations</h3>
      {analysis.output.limitations.map((text, index) => <p key={index}>{text}</p>)}
    </section>
  </>;
}

export function HrCoaching({ review, data, error, busy, notes, setNotes, request, refresh, decide }: {
  review: Review; data: State | null; error: string; busy: boolean; notes: string;
  setNotes: (notes: string) => void; request: () => Promise<void>;
  refresh: () => Promise<unknown>; decide: (id: string, decision: string) => Promise<void>;
}) {
  const current = data?.analyses.filter((a) => a.round === review.round) || [];
  const accepted = current.filter((a) => a.state === "SUCCEEDED" && a.decision === "ACCEPTED")
    .sort((a, b) => (b.reviewed_at || b.created_at).localeCompare(a.reviewed_at || a.created_at))[0];
  const pending = current.filter((a) => a.state === "SUCCEEDED" && !a.decision);
  const active = current.find((a) => ["QUEUED", "RUNNING", "RETRYING"].includes(a.state));
  return <Card title="Steward coaching">
    <p className={styles.muted}>Human-reviewed advisory guidance</p>
    <p>AI offers discussion questions and support options. Human judgement determines the assessment.</p>
    {!data && !error && <p role="status">Loading coaching status…</p>}
    {data && !data.configured && <p className="alert">AI connection is not configured. The human review can continue.</p>}
    <Feedback error={error} />
    {accepted && <div className={styles.accepted}>
      <Badge>Accepted by Head of HR</Badge>
      <Guidance analysis={accepted} review={review} />
    </div>}
    {active && <p role="status">Coaching: {human(active.state)}</p>}
    {pending.map((analysis) => <details key={analysis.id} open={!accepted}>
      <summary>Coaching awaiting human review · {new Date(analysis.created_at).toLocaleString()}</summary>
      <Guidance analysis={analysis} review={review} />
      {review.state !== "FINALISED" && <>
        <label>Human review notes
          <textarea maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="actions">
          <Button disabled={busy || !notes.trim()} onClick={() => decide(analysis.id, "ACCEPTED")}>Accept as coaching input</Button>
          <Button variant="neutral" disabled={busy || !notes.trim()} onClick={() => decide(analysis.id, "REJECTED")}>Reject coaching</Button>
        </div>
      </>}
    </details>)}
    <HrDisclosure enabled={!!accepted} label="Coaching actions">
      <div className="actions">
        <Button disabled={busy || !data?.configured || !["SUBMITTED", "CONVERSATION_READY"].includes(review.state)} onClick={request}>Generate coaching</Button>
        <Button variant="neutral" onClick={refresh}>Refresh status</Button>
      </div>
    </HrDisclosure>
    <details>
      <summary>AI history and provenance{data ? ` (${data.analyses.length})` : ""}</summary>
      {data?.analyses.map((analysis) => <div className="analysis" key={analysis.id}>
        <h3>Round {analysis.round} <Badge>{human(analysis.state)}</Badge> {analysis.decision && <Badge>{human(analysis.decision)}</Badge>}</h3>
        <dl className="record-fields">
          <div><dt>Model</dt><dd>{analysis.model}</dd></div>
          <div><dt>Prompt version</dt><dd>{analysis.prompt_version}</dd></div>
          <div><dt>Requested</dt><dd>{new Date(analysis.created_at).toLocaleString()}</dd></div>
          {analysis.reviewed_at && <div><dt>Reviewed</dt><dd>{new Date(analysis.reviewed_at).toLocaleString()}</dd></div>}
          {analysis.decision_notes && <div><dt>Human review notes</dt><dd>{analysis.decision_notes}</dd></div>}
        </dl>
        {analysis.output?.strengths && <details>
          <summary>View recorded guidance and source provenance</summary>
          <Guidance analysis={analysis} review={review} />
          <h4>Source references</h4>
          {(["strengths", "gaps", "support_options"] as const).flatMap((key) =>
            analysis.output![key].map((item, index) => <p className={styles.provenance} key={`${key}-${index}`}>
              {human(key)} {index + 1}: {item.source_ids.join(", ")}
            </p>))}
        </details>}
      </div>)}
      {data?.analyses.length === 0 && <p>No analyses recorded.</p>}
    </details>
  </Card>;
}
