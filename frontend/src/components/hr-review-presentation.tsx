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

type PillarKey =
  | "context"
  | "character"
  | "capability"
  | "continuity"
  | "contribution";

const PILLARS: Array<{
  key: PillarKey;
  title: string;
}> = [
  { key: "context", title: "Context" },
  { key: "character", title: "Character" },
  { key: "capability", title: "Capability" },
  { key: "continuity", title: "Continuity" },
  { key: "contribution", title: "Contribution" },
];

const COACHING_GROUPS = [
  ["strengths", "Strengths"],
  ["gaps", "Development focus"],
  ["support_options", "Support options"],
] as const;

export function HrReviewFrame({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return enabled ? (
    <div className={styles.workspace}>{children}</div>
  ) : (
    <>{children}</>
  );
}

export function HrDisclosure({
  enabled,
  label,
  children,
}: {
  enabled: boolean;
  label: string;
  children: ReactNode;
}) {
  return enabled ? (
    <details>
      <summary>{label}</summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  );
}

export function HrWorkflow({
  review,
  coaching,
}: {
  review: Review;
  coaching?: CoachingSummary;
}) {
  const rows = [
    [
      "Steward Associate reflection",
      (
        review.workflow?.employee_submitted ??
        review.forms?.some(
          (f) => f.kind === "EMPLOYEE" && f.submitted_at,
        )
      )
        ? "Complete"
        : "Pending",
    ],
    [
      review.cycle_detail?.workflow_version === 2
        ? "Chief Steward appraisal"
        : "Chief Steward appraisal",
      (
        review.workflow?.manager_submitted ??
        review.forms?.some(
          (f) => f.kind === "MANAGER" && f.submitted_at,
        )
      )
        ? "Complete"
        : "Pending",
    ],
    [
      "AI coaching",
      (review.workflow?.ai_coaching || coaching?.status) ===
      "Complete"
        ? "Complete"
        : "Pending",
    ],
    [
      "Commitments",
      review.workflow?.commitments_complete
        ? "Complete"
        : "Pending",
    ],
    [
      "Acknowledgement",
      `Steward Associate: ${
        review.employee_ack ? "acknowledged" : "pending"
      } · Chief Steward: ${
        review.manager_ack ? "acknowledged" : "pending"
      }`,
    ],
    [
      "Final record",
      review.finalised_at || review.state === "FINALISED"
        ? "Complete"
        : "Pending",
    ],
  ];

  return (
    <Card title="Review progress">
      <dl className={styles.progress}>
        {rows.map(([label, status]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{status}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Guidance({
  analysis,
  review,
}: {
  analysis: Analysis;
  review: Review;
}) {
  const pillarCoaching = analysis.output?.pillar_coaching;

  if (!pillarCoaching) {
    return null;
  }

  const evidenceIds = new Set(
    review.evidence?.map((e) => e.id),
  );

  return (
    <>
      {PILLARS.map(({ key: pillarKey, title }) => {
        const pillar = pillarCoaching[pillarKey];

        if (!pillar) {
          return null;
        }

        const hasContent =
          pillar.strengths.length > 0 ||
          pillar.gaps.length > 0 ||
          pillar.support_options.length > 0 ||
          pillar.limitations.length > 0;

        return (
          <section
            key={pillarKey}
            className={styles.guidance}
          >
            <h3>{title} Coaching</h3>

            {!hasContent && (
              <p className={styles.muted}>
                No pillar-specific coaching was generated.
              </p>
            )}

            {COACHING_GROUPS.map(
              ([groupKey, groupTitle]) => {
                const items = pillar[groupKey];

                return (
                  <div key={groupKey}>
                    <h4>{groupTitle}</h4>

                    {items.length === 0 ? (
                      <p className={styles.muted}>
                        No coaching observations recorded for
                        this section.
                      </p>
                    ) : (
                      items.map((item, index) => (
                        <div
                          className="coaching-observation"
                          key={`${pillarKey}-${groupKey}-${index}`}
                        >
                          <p>{item.observation}</p>

                          {item.question && (
                            <p>
                              <strong>Discuss:</strong>{" "}
                              {item.question}
                            </p>
                          )}

                          {item.uncertainty && (
                            <p className={styles.muted}>
                              {item.uncertainty}
                            </p>
                          )}

                          {item.source_ids.some((id) =>
                            evidenceIds.has(id),
                          ) && (
                            <small>
                              Source: Validated evidence
                            </small>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                );
              },
            )}

            {pillar.limitations.length > 0 && (
              <div>
                <h4>Limitations</h4>

                {pillar.limitations.map(
                  (text, index) => (
                    <p
                      key={`${pillarKey}-limitation-${index}`}
                    >
                      {text}
                    </p>
                  ),
                )}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

export function HrCoaching({
  review,
  data,
  error,
  busy,
  notes,
  setNotes,
  refresh,
  decide,
  canDecide,
}: {
  review: Review;
  data: State | null;
  error: string;
  busy: boolean;
  notes: string;
  setNotes: (notes: string) => void;
  request: () => Promise<void>;
  refresh: () => Promise<unknown>;
  decide: (
    id: string,
    decision: string,
  ) => Promise<void>;
  canDecide: boolean;
}) {
  const current =
    data?.analyses.filter(
      (a) => a.round === review.round,
    ) || [];

  const accepted = current
    .filter(
      (a) =>
        a.state === "SUCCEEDED" &&
        a.decision === "ACCEPTED",
    )
    .sort((a, b) =>
      (b.reviewed_at || b.created_at).localeCompare(
        a.reviewed_at || a.created_at,
      ),
    )[0];

  const pending = current.filter(
    (a) =>
      a.state === "SUCCEEDED" &&
      !a.decision,
  );

  const active = current.find((a) =>
    ["QUEUED", "RUNNING", "RETRYING"].includes(
      a.state,
    ),
  );

  return (
    <Card title="Steward coaching">
      <p className={styles.muted}>
        Human-reviewed, pillar-based advisory guidance
      </p>

      <p>
        AI coaching is generated separately for Context,
        Character, Capability, Continuity and Contribution.
        It compares the original pillar targets with the
        Steward Associate reflection and Chief Steward appraisal. Human
        judgement determines the formal assessment.
      </p>

      {!data && !error && (
        <p role="status">
          Loading coaching status…
        </p>
      )}

      {data && !data.configured && (
        <p className="alert">
          AI connection is not configured. Configure the
          integration to enable new coaching.
        </p>
      )}

      <p>{review.workflow?.ai_coaching}</p>

      <Button variant="neutral" disabled={busy} onClick={() => void refresh()}>
        Refresh status
      </Button>

      <Feedback error={error} />

      {accepted && (
        <div className={styles.accepted}>
          <Badge>Accepted by Chief Steward</Badge>

          <Guidance
            analysis={accepted}
            review={review}
          />
        </div>
      )}

      {active && (
        <p role="status">
          Coaching: {human(active.state)}
        </p>
      )}

      {pending.map((analysis) => (
        <details
          key={analysis.id}
          open={!accepted}
        >
          <summary>
            Coaching awaiting human review ·{" "}
            {new Date(
              analysis.created_at,
            ).toLocaleString()}
          </summary>

          <Guidance
            analysis={analysis}
            review={review}
          />

          {canDecide &&
            review.state !== "FINALISED" && (
              <>
                <label>
                  Human review notes
                  <textarea
                    maxLength={5000}
                    value={notes}
                    onChange={(e) =>
                      setNotes(e.target.value)
                    }
                  />
                </label>

                <div className="actions">
                  <Button
                    disabled={
                      busy || !notes.trim()
                    }
                    onClick={() =>
                      decide(
                        analysis.id,
                        "ACCEPTED",
                      )
                    }
                  >
                    Accept as coaching input
                  </Button>

                  <Button
                    variant="neutral"
                    disabled={
                      busy || !notes.trim()
                    }
                    onClick={() =>
                      decide(
                        analysis.id,
                        "REJECTED",
                      )
                    }
                  >
                    Reject coaching
                  </Button>
                </div>
              </>
            )}
        </details>
      ))}

      <HrDisclosure
        enabled={!!accepted}
        label="Coaching actions"
      >
        <div className="actions">
          <p>
            The Steward Associate runs AI coaching after both
            submissions are complete.
          </p>
        </div>
      </HrDisclosure>

      <details>
        <summary>
          AI history and provenance
          {data
            ? ` (${data.analyses.length})`
            : ""}
        </summary>

        {data?.analyses.map((analysis) => (
          <div
            className="analysis"
            key={analysis.id}
          >
            <h3>
              Round {analysis.round}{" "}
              <Badge>
                {human(analysis.state)}
              </Badge>{" "}
              {analysis.decision && (
                <Badge>
                  {human(analysis.decision)}
                </Badge>
              )}
            </h3>

            <dl className="record-fields">
              <div>
                <dt>Requested</dt>
                <dd>
                  {new Date(
                    analysis.created_at,
                  ).toLocaleString()}
                </dd>
              </div>

              {analysis.reviewed_at && (
                <div>
                  <dt>Reviewed</dt>
                  <dd>
                    {new Date(
                      analysis.reviewed_at,
                    ).toLocaleString()}
                  </dd>
                </div>
              )}

              {analysis.decision_notes && (
                <div>
                  <dt>
                    Human review notes
                  </dt>
                  <dd>
                    {analysis.decision_notes}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ))}

        {data?.analyses.length === 0 && (
          <p>No analyses recorded.</p>
        )}
      </details>
    </Card>
  );
}
