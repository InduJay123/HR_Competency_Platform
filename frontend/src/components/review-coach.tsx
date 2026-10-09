"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import { human, type Review } from "@/lib/reviews";
import { Button, Card, Feedback, Badge } from "./ui";
import { HrCoaching, type CoachingSummary } from "./hr-review-presentation";
import { useSession } from "./shell";
type Observation = {
  observation: string;
  source_ids: string[];
  question: string;
  uncertainty: string;
};
export type Analysis = {
  id: string;
  round: number;
  state: string;
  input_hash: string;
  prompt_version: string;
  model: string;
  created_at: string;
  reviewed_at?: string | null;
  decision: string;
  decision_notes: string;
  error_code: string;
  output?: {
    strengths: Observation[];
    gaps: Observation[];
    support_options: Observation[];
    limitations: string[];
  };
};
export type State = { configured: boolean; analyses: Analysis[] };
export function Coach({ review, oversight = false, onSummary, onSaved }: {
  review: Review;
  oversight?: boolean;
  onSummary?: (summary: CoachingSummary) => void;
  onSaved?: () => Promise<void>;
}) {
  const session = useSession();
  const member = session.memberships?.find(m => m.company_id === session.company_id);
  const employee = member?.id === review.employee_member;
  const reviewer = member?.id === review.reviewer;
  const [data, setData] = useState<State | null>(null),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const reload = useCallback(
    () => api<State>(`reviews/${review.id}/ai-coaching/`).then(value => { setData(value); }),
    [review.id],
  );
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [reload, review.version]);
  useEffect(() => {
    if (!onSummary || !data) return;
    const current = data.analyses.filter((a) => a.round === review.round);
    const accepted = current.some((a) => a.state === "SUCCEEDED" && a.decision === "ACCEPTED");
    onSummary({
      reviewId: review.id,
      round: review.round,
      accepted,
      status: current.some(a => a.state === "SUCCEEDED") ? "Complete" : current[0]
        ? human(current[0].decision || current[0].state) : "Not requested",
    });
  }, [data, onSummary, review.id, review.round]);
  useEffect(() => {
    if (
      !data?.analyses.some((a) =>
        ["QUEUED", "RUNNING", "RETRYING"].includes(a.state),
      )
    )
      return;
    const timer = setTimeout(
      () => void reload().then(() => onSaved?.()).catch((e) => setError(e.message)),
      4000,
    );
    return () => clearTimeout(timer);
  }, [data, reload, onSaved]);
  async function request() {
    setBusy(true);
    setError("");
    try {
      await post(`reviews/${review.id}/ai-coaching/`, {
        version: review.version,
      });
      await reload();
      await onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(id: string, decision: string) {
    setBusy(true);
    setError("");
    try {
      await post(`reviews/${review.id}/ai-decision/`, {
        analysis_id: id,
        decision,
        notes,
      });
      await reload();
      setNotes("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (oversight) return (
    <HrCoaching review={review} data={data} error={error} busy={busy}
      notes={notes} setNotes={setNotes} request={request} decide={decide}
      refresh={() => reload().then(() => onSaved?.()).catch((e) => setError(e.message))} canDecide={reviewer} />
  );
  return (
    <>
      <button
        className="coach-launcher"
        aria-label="Open stewardship AI coaching"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Image src="/steward.png" width={54} height={54} alt="" />
        <span>Steward</span>
      </button>
      <Card title="AI Coaching">
        <p>
          Advisory questions and support options, grounded in the submitted
          forms and Head of HR’s authorised excerpts. AI does not assign ratings
          or make employment decisions.
        </p>
        {data && !data.configured && (
          <p className="alert">
            AI connection is not configured. Contact Head of HR to configure it.
          </p>
        )}
        <Feedback error={error} />
        <p role="status">{review.workflow?.ai_coaching || "Loading coaching status…"}</p>
        {review.workflow?.ai_blocked_reason && <p className="alert">{review.workflow.ai_blocked_reason}</p>}
        {!employee && <p>The employee runs AI coaching after both submissions are complete.</p>}
        <div className="actions">
          {employee && <Button
            disabled={
              busy ||
              !data?.configured ||
              !!review.workflow?.ai_blocked_reason ||
              review.state === "FINALISED" ||
              !["Ready", "Failed / retry"].includes(review.workflow?.ai_coaching || "")
            }
            onClick={request}
          >
            Run AI Coaching
          </Button>}
          <Button
            variant="neutral"
            onClick={() => reload().then(() => onSaved?.()).catch((e) => setError(e.message))}
          >
            Refresh status
          </Button>
        </div>
        {open && (
          <p className="coach-tip">
            Start by checking evidence quality. Ask what changed, what helped
            and what support would make the next outcome more likely.
          </p>
        )}
        {data?.analyses.map((a) => (
          <div className="analysis" key={a.id}>
            <h3>
              Round {a.round} <Badge>{human(a.state)}</Badge>
            </h3>
            <small>
              {new Date(a.created_at).toLocaleString()}
            </small>
            {a.error_code && (
              <p>
                Analysis failed. The employee can retry; contact Head of HR if retries are exhausted.
              </p>
            )}
            {a.output?.strengths &&
              (["strengths", "gaps", "support_options"] as const).map(
                (group) => (
                  <section key={group}>
                    <h3>{human(group)}</h3>
                    {a.output![group].map((item, i) => (
                      <div className="coaching-observation" key={i}>
                        <p>{item.observation}</p>
                        <p>
                          <strong>Discuss:</strong> {item.question}
                        </p>
                        <small>{item.uncertainty}</small>
                        <small>Sources: {item.source_ids.join(", ")}</small>
                      </div>
                    ))}
                  </section>
                ),
              )}
            {a.output?.limitations?.map((x, i) => (
              <p key={i}>Limitation: {x}</p>
            ))}
            {a.decision ? (
              <p>
                Human review: {a.decision} · {a.decision_notes}
              </p>
            ) : (
              reviewer && a.state === "SUCCEEDED" &&
              a.round === review.round &&
              review.state !== "FINALISED" && (
                <>
                  <label>
                    Human review notes
                    <textarea
                      maxLength={5000}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  <div className="actions">
                    <Button
                      disabled={busy || !notes.trim()}
                      onClick={() => decide(a.id, "ACCEPTED")}
                    >
                      Accept as coaching input
                    </Button>
                    <Button
                      variant="neutral"
                      disabled={busy || !notes.trim()}
                      onClick={() => decide(a.id, "REJECTED")}
                    >
                      Reject coaching
                    </Button>
                  </div>
                </>
              )
            )}
            
          </div>
        ))}
      </Card>
    </>
  );
}
