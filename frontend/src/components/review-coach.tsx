"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import { human, type Review } from "@/lib/reviews";
import { Button, Card, Feedback, Badge } from "./ui";
import { HrCoaching, type CoachingSummary } from "./hr-review-presentation";
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
export function Coach({ review, oversight = false, onSummary }: {
  review: Review;
  oversight?: boolean;
  onSummary?: (summary: CoachingSummary) => void;
}) {
  const [data, setData] = useState<State | null>(null),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const reload = useCallback(
    () => api<State>(`reviews/${review.id}/ai-coaching/`).then(setData),
    [review.id],
  );
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [reload]);
  useEffect(() => {
    if (!onSummary || !data) return;
    const current = data.analyses.filter((a) => a.round === review.round);
    const accepted = current.some((a) => a.state === "SUCCEEDED" && a.decision === "ACCEPTED");
    onSummary({
      reviewId: review.id,
      round: review.round,
      accepted,
      status: accepted ? "Accepted" : current[0]
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
      () => void reload().catch((e) => setError(e.message)),
      4000,
    );
    return () => clearTimeout(timer);
  }, [data, reload]);
  async function request() {
    setBusy(true);
    setError("");
    try {
      await post(`reviews/${review.id}/ai-coaching/`, {
        version: review.version,
      });
      await reload();
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
      refresh={() => reload().catch((e) => setError(e.message))} />
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
      <Card title="AI coaching · human-reviewed">
        <p>
          Advisory questions and support options, grounded in the submitted
          forms and Head of HR’s authorised excerpts. AI does not assign ratings
          or make employment decisions.
        </p>
        {!data?.configured && (
          <p className="alert">
            AI connection is not configured. The human review can continue.
          </p>
        )}
        <Feedback error={error} />
        <div className="actions">
          <Button
            disabled={
              busy ||
              !data?.configured ||
              !["SUBMITTED", "CONVERSATION_READY"].includes(review.state)
            }
            onClick={request}
          >
            Generate coaching
          </Button>
          <Button
            variant="neutral"
            onClick={() => reload().catch((e) => setError(e.message))}
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
              {a.model} · {a.prompt_version} ·{" "}
              {new Date(a.created_at).toLocaleString()}
            </small>
            {a.error_code && (
              <p>
                Analysis unavailable ({a.error_code}). You can complete a
                human-led review.
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
              a.state === "SUCCEEDED" &&
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
            <details>
              <summary>Source provenance</summary>
              <p className="hash">Input SHA-256: {a.input_hash}</p>
            </details>
          </div>
        ))}
      </Card>
    </>
  );
}
