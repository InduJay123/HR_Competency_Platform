"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, post } from "@/lib/api";
import {
  human,
  type Evidence,
  type Json,
  type Review,
} from "@/lib/reviews";
import { Button, Card, Feedback, Loading, Badge } from "./ui";
import { ConfirmDialog } from "./confirm-dialog";
import { useSession } from "./shell";
import { ReviewForm } from "./review-form";
import { ReviewWorkflow } from "./review-workflow";
import { PillarReview } from "./pillar-review";
import { Coach } from "./review-coach";
import { HrDisclosure, HrReviewFrame, HrWorkflow, hrReviewStyles, type CoachingSummary } from "./hr-review-presentation";

export function RecordContent({ value }: { value: Json }) {
  if (value === null || value === "")
    return <span className="muted">Not recorded</span>;
  if (Array.isArray(value))
    return (
      <div className="record-items">
        {value.map((v, i) => (
          <div key={i}>
            <RecordContent value={v} />
          </div>
        ))}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl className="record-fields">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>{human(k)}</dt>
            <dd>
              <RecordContent value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <span>{String(value)}</span>;
}

function EvidenceValidation({
  item,
  onSaved,
}: {
  item: Evidence;
  onSaved: () => void;
}) {
  const [excerpt, setExcerpt] = useState(item.authorised_excerpt || ""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(validation: string) {
    setBusy(true);
    try {
      await post(`evidence/${item.id}/validate/`, {
        validation,
        authorised_excerpt: excerpt,
        validation_reason: reason,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="evidence-row">
      <h3>
        {item.title} <Badge>{human(item.validation)}</Badge>
      </h3>
      <p>{item.note}</p>
      {item.link && (
        <a href={item.link} target="_blank" rel="noreferrer">
          Open source link ↗
        </a>
      )}
      {item.kind === "FILE" && (
        <a href={`/api/v1/evidence/${item.id}/download/`}>
          Download private evidence
        </a>
      )}
      {item.validation === "PENDING" ? (
        <>
          <label>
            Authorised excerpt
            <small>
              Only this excerpt is eligible for AI analysis after you validate
              it.
            </small>
            <textarea
              value={excerpt}
              maxLength={20000}
              onChange={(e) => setExcerpt(e.target.value)}
            />
          </label>
          <label>
            Validation or exclusion reason
            <textarea
              value={reason}
              maxLength={4000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Feedback error={error} />
          <div className="actions">
            <Button
              disabled={busy || !reason || !excerpt}
              onClick={() => save("VALIDATED")}
            >
              Validate evidence
            </Button>
            <Button
              variant="neutral"
              disabled={busy || !reason}
              onClick={() => save("EXCLUDED")}
            >
              Exclude
            </Button>
          </div>
        </>
      ) : (
        <>
          <p>{item.authorised_excerpt}</p>
          <small>{item.validation_reason}</small>
        </>
      )}
    </div>
  );
}

type CoachingItem = {
  observation: string;
  source_ids: string[];
  question: string;
  uncertainty: string;
};

type PillarCoaching = {
  strengths: CoachingItem[];
  gaps: CoachingItem[];
  support_options: CoachingItem[];
  limitations: string[];
};

type PillarKey =
  | "context"
  | "character"
  | "capability"
  | "continuity"
  | "contribution";

type AcceptedCoaching = {
  available: boolean;
  coaching: Record<PillarKey, PillarCoaching> | null;
  reviewed_at?: string | null;
  sources?: Record<string, string>;
};

const PILLAR_COACHING_LABELS: Array<{
  key: PillarKey;
  title: string;
  description: string;
}> = [
  {
    key: "context",
    title: "Context",
    description:
      "Coaching around understanding the wider environment, stakeholders, dependencies and consequences.",
  },
  {
    key: "character",
    title: "Character",
    description:
      "Coaching around ownership, judgement, trust, responsibility and behaviour under pressure.",
  },
  {
    key: "capability",
    title: "Capability",
    description:
      "Coaching around strengths, development, delegation, learning and building capability in others.",
  },
  {
    key: "continuity",
    title: "Continuity",
    description:
      "Coaching around knowledge transfer, resilient systems, succession and what others can carry forward.",
  },
  {
    key: "contribution",
    title: "Contribution",
    description:
      "Coaching around measurable value, outcomes and meaningful impact.",
  },
];

const COACHING_GROUPS = [
  ["strengths", "Strengths"],
  ["gaps", "Development focus"],
  ["support_options", "Support options"],
] as const;

function EmployeeCoaching({ review }: { review: Review }) {
  const [result, setResult] = useState<AcceptedCoaching | null>(null);

  useEffect(() => {
    let alive = true;

    api<AcceptedCoaching>(
      `reviews/${review.id}/accepted-coaching/`,
    )
      .then((data) => {
        if (alive) {
          setResult(data);
        }
      })
      .catch(() => {
        if (alive) {
          setResult(null);
        }
      });

    return () => {
      alive = false;
    };
  }, [review.id, review.version]);

  if (!result?.available || !result.coaching) {
    return null;
  }

  return (
    <Card title="Steward coaching">
      <p>
        Human-reviewed, pillar-based coaching grounded in your original
        targets, Steward Guy reflection and Chief Steward appraisal.
      </p>

      <Badge>Reviewed by Chief Steward</Badge>

      {result.reviewed_at && (
        <p className="muted">
          Reviewed{" "}
          {new Date(result.reviewed_at).toLocaleString()}
        </p>
      )}

      {PILLAR_COACHING_LABELS.map(
        ({ key: pillarKey, title, description }) => {
          const pillar = result.coaching?.[pillarKey];

          if (!pillar) {
            return null;
          }

          const hasObservations =
            pillar.strengths.length > 0 ||
            pillar.gaps.length > 0 ||
            pillar.support_options.length > 0;

          return (
            <section
              key={pillarKey}
              className="pillar-coaching"
            >
              <div>
                <h3>{title} Coaching</h3>
                <p className="muted">{description}</p>
              </div>

              {COACHING_GROUPS.map(
                ([groupKey, groupTitle]) => {
                  const items = pillar[groupKey];

                  return (
                    <div key={groupKey}>
                      <h4>{groupTitle}</h4>

                      {items.length === 0 ? (
                        <p className="muted">
                          No coaching observations recorded
                          for this section.
                        </p>
                      ) : (
                        items.map((item, index) => {
                          const labels = [
                            ...new Set(
                              item.source_ids
                                .map(
                                  (id) =>
                                    result.sources?.[id],
                                )
                                .filter(
                                  (
                                    label,
                                  ): label is string =>
                                    Boolean(label),
                                ),
                            ),
                          ];

                          return (
                            <div
                              className="coaching-observation"
                              key={`${pillarKey}-${groupKey}-${index}`}
                            >
                              <p>{item.observation}</p>

                              {item.question && (
                                <p>
                                  <strong>
                                    Discuss:
                                  </strong>{" "}
                                  {item.question}
                                </p>
                              )}

                              {item.uncertainty && (
                                <p className="muted">
                                  {item.uncertainty}
                                </p>
                              )}

                              {labels.length > 0 && (
                                <small>
                                  Sources:{" "}
                                  {labels.join(", ")}
                                </small>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                },
              )}

              {!hasObservations &&
                pillar.limitations.length === 0 && (
                  <p className="muted">
                    No pillar-specific coaching was
                    generated.
                  </p>
                )}

              {pillar.limitations.length > 0 && (
                <div>
                  <h4>Limitations</h4>

                  {pillar.limitations.map(
                    (item, index) => (
                      <p
                        key={`${pillarKey}-limitation-${index}`}
                      >
                        {item}
                      </p>
                    ),
                  )}
                </div>
              )}
            </section>
          );
        },
      )}

      <p className="muted">
        AI coaching is advisory. Human review outcomes and
        Steward judgements remain authoritative.
      </p>
    </Card>
  );
}

export function ReviewDetail({ showAcceptedCoaching = false, oversight = false }: {
  showAcceptedCoaching?: boolean;
  oversight?: boolean;
}) {
  const { id } = useParams<{ id: string }>();
  const s = useSession();
  const member = s.memberships?.find((m) => m.company_id === s.company_id);
  const [coachingSummary, setCoachingSummary] = useState<CoachingSummary>();
  const [review, setReview] = useState<Review | null>(null),
    [comments, setComments] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const submitting = useRef(false);
  function requestConfirmation(name: string) {
    setError("");
    setSuccess("");
    setConfirmation(name);
  }
  const reload = useCallback(async () => {
    setReview(await api<Review>(`reviews/${id}/`));
  }, [id]);
  useEffect(() => {
    let alive = true;
    api<Review>(`reviews/${id}/`)
      .then((r) => {
        if (alive) setReview(r);
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);
  async function action(name: string) {
    if (!review || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await post(`reviews/${id}/${name}/`, {
        version: review.version,
        reason,
        ...(name === "acknowledge" && member?.id === review.employee_member
          ? { comments }
          : {}),
      });
      await reload();
      setConfirmation("");
      setSuccess(
        name === "complete"
          ? "Final record saved and sealed."
          : name === "revision"
            ? "New revision round opened. Earlier submissions are preserved."
            : "Your acknowledgement is recorded.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (!review) return error ? <Feedback error={error} /> : <Loading />;
  const visibleHistory = review.history?.filter(
    (event) => event.action !== "employee.saved" && event.action !== "manager.saved",
  ) || [];
  const employee = member?.id === review.employee_member,
    manager = member?.id === review.manager_member,
    hr = member?.id === review.reviewer;
  const consolidated = !!review.pillar_context?.length;
  const own = employee ? "EMPLOYEE" : manager ? "MANAGER" : null;
  const currentCoaching = coachingSummary?.reviewId === review.id && coachingSummary.round === review.round
    ? coachingSummary : undefined;
  return (
    <HrReviewFrame enabled={oversight}>
      <Link
        href={
          hr
            ? "/hr/reviews"
            : manager
              ? "/manager/reviews"
              : "/employee/reviews"
        }
      >
        ← Review workspace
      </Link>
      <p className="eyebrow">
        {oversight ? `${human(review.cycle_detail.kind)} review · Round ${review.round}${review.senior_leader ? " · Senior leadership" : ""}` : review.senior_leader
          ? "SENIOR LEADERSHIP EVALUATION"
          : "STEWARDSHIP EVALUATION"}
      </p>
      <div className="page-heading">
        <div>
          <h1>{review.employee_name}</h1>
          <p className="subtitle">
            {oversight ? <>{review.cycle_detail.starts_on} – {review.cycle_detail.ends_on}<br />Due {review.cycle_detail.due_on}</> : <>
              {human(review.cycle_detail.kind)} {review.cycle_detail.year} · Round{" "}
              {review.round} · Due {review.cycle_detail.due_on}
            </>}
          </p>
        </div>
        <Badge>{human(review.state)}</Badge>
      </div>
      <div className="review-banner">
        <strong>Evidence informs. People decide.</strong>
        <p>
          Steward Guy reflection → Chief Steward appraisal → AI coaching →
          commitments → acknowledgement → final record
        </p>
      </div>
      <Feedback error={confirmation ? "" : error} success={success} />
      <HrWorkflow review={review} coaching={currentCoaching} />
      <PillarReview review={review} />
      {own && review.state !== "FINALISED" && (!consolidated || !review.forms?.some(f => f.kind === own && f.submitted_at)) && (
        <ReviewForm
          key={`${review.id}-${review.round}`}
          review={review}
          kind={own}
          onSubmitted={reload}
        />
      )}
      {review.forms
        ?.filter((f) => !consolidated && (f.kind !== own || review.state === "FINALISED"))
        .map((f) => (
          <Card
            key={f.kind}
            title={oversight ? (f.kind === "EMPLOYEE" ? "Steward Guy reflection" : "Chief Steward appraisal") : `${human(f.kind)} submission · ${f.submitted_at ? "Sealed" : "Draft"}`}
          >
            {oversight && <>
              <p><Badge>{f.submitted_at ? "Submitted" : "Draft"}</Badge></p>
              {f.kind === "MANAGER" && <p>
                Overall descriptor: {String(f.content.overall || "Not recorded")}<br />
                ECP: {String(f.content.ecp || "Not recorded")}
              </p>}
            </>}
            <HrDisclosure enabled={oversight} label={f.kind === "EMPLOYEE" ? "View submission" : "View appraisal"}>
              <RecordContent value={f.content} />
            </HrDisclosure>
          </Card>
        ))}
      {showAcceptedCoaching && employee && (
        <EmployeeCoaching key={`${review.id}-${review.round}-${review.version}`} review={review} />
      )}

      {(employee || manager || hr || review.can_view_coaching) && <Coach review={review} oversight={oversight} onSummary={setCoachingSummary} onSaved={reload} />}
      <ReviewWorkflow key={`${review.id}-${review.round}`} review={review} role={employee ? "employee" : manager ? "manager" : null} hr={hr} onSaved={reload} />

      {(review.forms || review.snapshot) && (
        <Card title="Acknowledgements">
          {review.employee_comments && (
            <div>
              <h3>Steward Guy’s recorded perspective</h3>
              <p className="long-copy">{review.employee_comments}</p>
            </div>
          )}
          <p>
            Steward Guy: {review.employee_ack ? "Acknowledged" : "Pending"} ·
            Chief Steward: {review.manager_ack ? "Acknowledged" : "Pending"}
          </p>
          {review.state !== "FINALISED" && ((employee && !review.employee_ack) ||
            (manager && !review.manager_ack)) && (
            <>
              {employee && (
                <label>
                  Steward Guy comments (optional)
                  <small>
                    Record your perspective, including any disagreement. These
                    comments become part of the shared final record.
                  </small>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    maxLength={10000}
                    disabled={busy}
                  />
                </label>
              )}
              <p>
                Acknowledgement means “I have reviewed this final record”. It does not require agreement with every judgement.
                Raise discrepancies with Chief Steward before finalisation.
              </p>
              <Button
                disabled={busy || review.state === "FINALISED" || !review.workflow?.commitments_complete || !review.hr_assessment?.overall}
                onClick={() => requestConfirmation("acknowledge")}
              >
                Acknowledge Review
              </Button>
            </>
          )}
          {!review.workflow?.commitments_complete && review.state !== "FINALISED" && <p className="alert">Acknowledgement unlocks after both participants confirm commitments.</p>}
          {review.workflow?.commitments_complete && !review.hr_assessment?.overall && <p className="alert">Waiting for Chief Steward to record the final human assessment.</p>}

        </Card>
      )}
      {hr && review.state !== "FINALISED" && <Card title="Finalisation">
        {!!review.workflow?.missing.length && <div role="alert" className="alert error">
          <strong>Cannot finalise review</strong><p>Missing:</p>
          <ul>{review.workflow.missing.map(item => <li key={item}>{item}</li>)}</ul>
        </div>}
        <Button disabled={busy || !review.workflow || !!review.workflow.missing.length} onClick={() => requestConfirmation("complete")}>Validate and Finalise Review</Button>
      </Card>}
      {hr && review.state !== "FINALISED" && (
        <Card title="Request a formal revision">
          <HrDisclosure enabled={oversight} label="Open revision options">
          <p>
            Open a new round for both forms. Earlier submissions remain in the
            history.
          </p>
          <label>
            Revision reason
            <textarea
              value={reason}
              maxLength={4000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            variant="neutral"
            disabled={busy || !reason.trim()}
            onClick={() => requestConfirmation("revision")}
          >
            Request revision
          </Button>
          </HrDisclosure>
        </Card>
      )}
      {confirmation && (
        <ConfirmDialog
          title={confirmation === "complete" ? "Finalise review" : "Confirm action"}
          description={confirmation === "complete"
            ? "Validate the completed review and create the final record."
            : confirmation === "revision"
              ? "Both participants must submit again in a new round."
              : "Record your acknowledgement of the shared review."}
          confirmLabel={confirmation === "complete" ? "Confirm Finalisation" : `Confirm ${human(confirmation)}`}
          loading={busy}
          error={error}
          onConfirm={() => action(confirmation)}
          onCancel={() => { if (!submitting.current) { setConfirmation(""); setError(""); } }}
        />
      )}
      {review.conversation?.discussion && (
        <Card title="Historical review notes">
          <p className="long-copy">{review.conversation.discussion}</p>
          {review.commitments?.map((c) => (
            <div className="evidence-row" key={c.id}>
              <h3>{c.action}</h3>
              <p>Support: {c.manager_support}</p>
              <p>Success: {c.success_measure}</p>
              <small>Due {c.due_date}</small>
            </div>
          ))}
        </Card>
      )}
      {review.midyear_baseline && (
        <Card title="Mid-Year historical reference">
          <p>Read-only reference. Mid-Year commitment outcomes are not required to submit this appraisal.</p>
          <Link href={`/employee/reviews/${id}/comparison`}>
            View historical commitments →
          </Link>
          <details>
            <summary>View the final Mid-Year record</summary>
            <RecordContent value={review.midyear_baseline} />
          </details>
        </Card>
      )}
      
      {!!review.submission_history?.length && <Card title="Review history">
        <details><summary>View previous submitted rounds</summary><RecordContent value={review.submission_history} /></details>
      </Card>}
      <Card title="Workflow history">
        <HrDisclosure enabled={oversight} label={`View full history (${visibleHistory.length} events)`}>
        {visibleHistory.map((h) => (
          <div className={`history-row${oversight && /(?:^|[._])saved$/.test(h.action) ? ` ${hrReviewStyles.autosave}` : ""}`} key={h.version}>
            <strong>{human(h.action.replaceAll(".", "_")).replace(/^Employee/, "Steward Guy").replace(/^Manager/, "Chief Steward")}</strong>
            <time>{new Date(h.created_at).toLocaleString()}</time>
            {h.actor_id && <p>By {[h.actor__user__first_name, h.actor__user__last_name].filter(Boolean).join(" ") || h.actor_id}</p>}
            {h.reason && h.action !== "commitment.saved" && !/^\s*[\[{]/.test(h.reason) && <p>{h.reason}</p>}
          </div>
        ))}
        </HrDisclosure>
      </Card>
    </HrReviewFrame>
  );
}
