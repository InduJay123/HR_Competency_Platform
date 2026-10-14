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
type PillarCoaching = {
  strengths: Observation[];
  gaps: Observation[];
  support_options: Observation[];
  limitations: string[];
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
    pillar_coaching: {
      context: PillarCoaching;
      character: PillarCoaching;
      capability: PillarCoaching;
      continuity: PillarCoaching;
      contribution: PillarCoaching;
    };
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
          Pillar-based coaching grounded in the original targets, Steward Guy
          reflection and Chief Steward appraisal. AI provides advisory questions
          and development support only and does not assign ratings or make
          employment decisions.
        </p>
        {data && !data.configured && (
          <p className="alert">
            AI connection is not configured. Contact Chief Steward to configure it.
          </p>
        )}
        <Feedback error={error} />
        <p role="status">{review.workflow?.ai_coaching || "Loading coaching status…"}</p>
        {review.workflow?.ai_blocked_reason && <p className="alert">{review.workflow.ai_blocked_reason}</p>}
        {!employee && <p>The Steward Guy runs AI coaching after both submissions are complete.</p>}
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
                Analysis failed. The Steward Guy can retry; contact Chief Steward if retries are exhausted.
              </p>
            )}
            {a.output?.pillar_coaching &&
  (
    [
      ["context", "Context"],
      ["character", "Character"],
      ["capability", "Capability"],
      ["continuity", "Continuity"],
      ["contribution", "Contribution"],
    ] as const
  ).map(([pillarKey, pillarTitle]) => {
    const pillar = a.output!.pillar_coaching[pillarKey];

    return (
      <section key={pillarKey} className="pillar-coaching">
        <h3>{pillarTitle} Coaching</h3>

        {(
          [
            ["strengths", "Strengths"],
            ["gaps", "Development focus"],
            ["support_options", "Support options"],
          ] as const
        ).map(([groupKey, groupTitle]) => (
          <div key={groupKey}>
            <h4>{groupTitle}</h4>

            {pillar[groupKey].length === 0 && (
              <p>No coaching observations for this section.</p>
            )}

            {pillar[groupKey].map((item, i) => (
              <div className="coaching-observation" key={i}>
                <p>{item.observation}</p>

                {item.question && (
                  <p>
                    <strong>Discuss:</strong> {item.question}
                  </p>
                )}

                {item.uncertainty && (
                  <small>{item.uncertainty}</small>
                )}

                {item.source_ids.length > 0 && (
                  <small>
                    Sources: {item.source_ids.join(", ")}
                  </small>
                )}
              </div>
            ))}
          </div>
        ))}

        {pillar.limitations.length > 0 && (
          <div>
            <h4>Limitations</h4>

            {pillar.limitations.map((item, i) => (
              <p key={i}>Limitation: {item}</p>
            ))}
          </div>
        )}
      </section>
    );
  })}
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
