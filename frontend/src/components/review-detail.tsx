"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, post } from "@/lib/api";
import {
  OVERALL,
  human,
  type Evidence,
  type Json,
  type Review,
} from "@/lib/reviews";
import { Button, Card, Feedback, Loading, Badge } from "./ui";
import { useSession } from "./shell";
import { ReviewForm } from "./review-form";
import { Coach } from "./review-coach";

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

type DraftCommitment = {
  owner: string;
  action: string;
  manager_support: string;
  success_measure: string;
  due_date: string;
};
function HumanConversation({
  review,
  onSaved,
}: {
  review: Review;
  onSaved: () => void;
}) {
  const [discussion, setDiscussion] = useState(""),
    [overall, setOverall] = useState(""),
    [rationale, setRationale] = useState(""),
    [manual, setManual] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [items, setItems] = useState<DraftCommitment[]>(
      Array.from({ length: 3 }, () => ({
        owner: review.employee,
        action: "",
        manager_support: "",
        success_measure: "",
        due_date: "",
      })),
    );
  function change(i: number, k: keyof DraftCommitment, v: string) {
    setItems(items.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await post(`reviews/${review.id}/conversation/`, {
        version: review.version,
        discussion,
        assessment: { overall, rationale, human_only_reason: manual },
        commitments: items,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Human review and conversation">
      <p>
        Discuss both perspectives with the employee and manager before sharing
        this record for acknowledgement.
      </p>
      <label>
        Head of HR · overall assessment
        <select value={overall} onChange={(e) => setOverall(e.target.value)}>
          <option value="">Choose descriptor</option>
          {OVERALL.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Human assessment rationale
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          maxLength={20000}
        />
      </label>
      <label>
        Conversation record
        <textarea
          value={discussion}
          onChange={(e) => setDiscussion(e.target.value)}
          maxLength={20000}
        />
      </label>
      <label>
        Reason for proceeding without AI
        <small>
          Required if no successful analysis is available. AI failure does not
          prevent a human-led review.
        </small>
        <textarea
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          maxLength={4000}
        />
      </label>
      <h3>Agreed development commitments · {items.length} of 3–5</h3>
      {items.map((x, i) => (
        <fieldset key={i}>
          <legend>Commitment {i + 1}</legend>
          <label>
            Owner
            <select
              value={x.owner}
              onChange={(e) => change(i, "owner", e.target.value)}
            >
              <option value={review.employee}>{review.employee_name}</option>
              <option value={review.manager}>{review.manager_name}</option>
            </select>
          </label>
          {(["action", "manager_support", "success_measure"] as const).map(
            (k) => (
              <label key={k}>
                {human(k)}
                <textarea
                  value={x[k]}
                  maxLength={4000}
                  onChange={(e) => change(i, k, e.target.value)}
                />
              </label>
            ),
          )}
          <label>
            Due date
            <input
              type="date"
              value={x.due_date}
              onChange={(e) => change(i, "due_date", e.target.value)}
            />
          </label>
          {items.length > 3 && (
            <Button
              variant="neutral"
              onClick={() => setItems(items.filter((_, n) => n !== i))}
            >
              Remove commitment
            </Button>
          )}
        </fieldset>
      ))}
      <div className="actions">
        {items.length < 5 && (
          <Button
            variant="neutral"
            onClick={() =>
              setItems([
                ...items,
                {
                  owner: review.employee,
                  action: "",
                  manager_support: "",
                  success_measure: "",
                  due_date: "",
                },
              ])
            }
          >
            Add commitment
          </Button>
        )}
        <Button disabled={busy} onClick={save}>
          Share for acknowledgement
        </Button>
      </div>
      <Feedback error={error} />
    </Card>
  );
}

export function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useSession();
  const member = s.memberships?.find((m) => m.company_id === s.company_id);
  const [review, setReview] = useState<Review | null>(null),
    [comments, setComments] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState("");
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
    if (!review) return;
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
      setBusy(false);
    }
  }
  if (!review) return error ? <Feedback error={error} /> : <Loading />;
  const employee = member?.id === review.employee_member,
    manager = member?.id === review.manager_member,
    hr = member?.id === review.reviewer;
  const own = employee ? "EMPLOYEE" : manager ? "MANAGER" : null;
  return (
    <>
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
        {review.senior_leader
          ? "SENIOR LEADERSHIP EVALUATION"
          : "STEWARDSHIP EVALUATION"}
      </p>
      <div className="page-heading">
        <div>
          <h1>{review.employee_name}</h1>
          <p className="subtitle">
            {human(review.cycle_detail.kind)} {review.cycle_detail.year} · Round{" "}
            {review.round} · Due {review.cycle_detail.due_on}
          </p>
        </div>
        <Badge>{human(review.state)}</Badge>
      </div>
      <div className="review-banner">
        <strong>Evidence informs. People decide.</strong>
        <p>
          Employee reflection → manager appraisal → evidence validation →
          coaching → conversation → commitments → final record
        </p>
      </div>
      <Feedback error={error} success={success} />
      {own && review.state !== "FINALISED" && (
        <ReviewForm
          key={`${review.id}-${review.round}`}
          review={review}
          kind={own}
          onSubmitted={reload}
        />
      )}
      {review.forms
        ?.filter((f) => f.kind !== own || review.state === "FINALISED")
        .map((f) => (
          <Card
            key={f.kind}
            title={`${human(f.kind)} submission · ${f.submitted_at ? "Sealed" : "Draft"}`}
          >
            <RecordContent value={f.content} />
          </Card>
        ))}
      {hr && (
        <>
          <Card title="Authorised evidence">
            {review.evidence?.length ? (
              review.evidence.map((e) => (
                <EvidenceValidation key={e.id} item={e} onSaved={reload} />
              ))
            ) : (
              <p>
                No evidence was selected in submitted forms. Discuss and record
                this limitation before making an assessment.
              </p>
            )}
          </Card>
          <Coach review={review} />
          {["SUBMITTED", "CONVERSATION_READY"].includes(review.state) && (
            <HumanConversation review={review} onSaved={reload} />
          )}
        </>
      )}
      {review.conversation?.discussion && (
        <Card title="Shared conversation record">
          <p className="long-copy">{review.conversation.discussion}</p>
          <h3>{review.hr_assessment?.overall}</h3>
          <p>{review.hr_assessment?.rationale}</p>
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
      {review.state === "ACKNOWLEDGEMENT_PENDING" && (
        <Card title="Acknowledgements">
          {review.employee_comments && (
            <div>
              <h3>Employee’s recorded perspective</h3>
              <p className="long-copy">{review.employee_comments}</p>
            </div>
          )}
          <p>
            Employee: {review.employee_ack ? "Acknowledged" : "Pending"} ·
            Manager: {review.manager_ack ? "Acknowledged" : "Pending"}
          </p>
          {((employee && !review.employee_ack) ||
            (manager && !review.manager_ack)) && (
            <>
              {employee && (
                <label>
                  Employee comments (optional)
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
                Acknowledgement confirms the discussion and receipt of the
                record. It does not require agreement with every judgement.
                Raise discrepancies with Head of HR before finalisation.
              </p>
              <Button
                disabled={busy}
                onClick={() => setConfirmation("acknowledge")}
              >
                Acknowledge this record
              </Button>
            </>
          )}
          {hr && (
            <Button
              disabled={busy || !review.employee_ack || !review.manager_ack}
              onClick={() => setConfirmation("complete")}
            >
              Finalise annual record
            </Button>
          )}
        </Card>
      )}
      {hr && review.state !== "FINALISED" && (
        <Card title="Request a formal revision">
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
            onClick={() => setConfirmation("revision")}
          >
            Request revision
          </Button>
        </Card>
      )}
      {confirmation && (
        <Card title="Confirm action">
          <p>
            {confirmation === "complete"
              ? "Finalisation permanently seals the agreed record."
              : confirmation === "revision"
                ? "Both participants must submit again in a new round."
                : "Record your acknowledgement of the shared conversation."}
          </p>
          <div className="actions">
            <Button disabled={busy} onClick={() => action(confirmation)}>
              Confirm {human(confirmation)}
            </Button>
            <Button variant="neutral" onClick={() => setConfirmation("")}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
      {review.midyear_baseline && (
        <Card title="Preserved Mid-Year baseline">
          <Link href={`/employee/reviews/${id}/comparison`}>
            Open commitment comparison →
          </Link>
          <details>
            <summary>Compare with the final Mid-Year record</summary>
            <RecordContent value={review.midyear_baseline} />
          </details>
        </Card>
      )}
      {review.snapshot && (
        <Card title="Final record · read-only">
          <p>
            This record is sealed. Development follow-up does not change it.
          </p>
          <p className="hash">SHA-256 {review.snapshot.sha256}</p>
          <details>
            <summary>View complete saved record</summary>
            <RecordContent value={review.snapshot.content} />
          </details>
          <Button variant="neutral" onClick={() => window.print()}>
            Print / save PDF
          </Button>
        </Card>
      )}
      <Card title="Workflow history">
        {review.history?.map((h) => (
          <div className="history-row" key={h.version}>
            <strong>{human(h.action.replaceAll(".", "_"))}</strong>
            <time>{new Date(h.created_at).toLocaleString()}</time>
            {h.reason && <p>{h.reason}</p>}
          </div>
        ))}
      </Card>
    </>
  );
}
