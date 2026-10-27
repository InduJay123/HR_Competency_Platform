"use client";
import { human, type Review, type PillarContext, type Json } from "@/lib/reviews";
import { Card } from "./ui";

export function PillarTargetDetails({ pillar }: { pillar: PillarContext }) {
  return <><p><strong>Original target:</strong> {pillar.target}</p>
    <p><strong>Success measure:</strong> {pillar.success_measure}</p><p><strong>Expected behaviour / notes:</strong> {pillar.notes || "Not specified"}</p>
  </>;
}

export function PillarReview({ review }: { review: Review }) {
  const reflection = review.forms?.find(f => f.kind === "EMPLOYEE" && f.submitted_at)?.content.pillars as Record<string, Json> | undefined;
  const managerForm = review.forms?.find(f => f.kind === "MANAGER" && f.submitted_at);
  const appraisal = managerForm?.content.pillars as Record<string, Record<string, Json>> | undefined;
  if (!review.pillar_context?.length) return null;
  return <Card title="Pillar review">
    {review.pillar_context.map(p => <div className="pillar" key={p.id}><h3>{human(p.pillar)}</h3><PillarTargetDetails pillar={p} />
      <h4>Steward Associate reflection</h4><p>{String(reflection?.[p.pillar.toLowerCase()] || "Awaiting submission")}</p>
      <h4>Chief Steward appraisal</h4><p>{String(appraisal?.[p.pillar.toLowerCase()]?.narrative || "Awaiting submission")}</p>
      <p>Outcome against target: {String(appraisal?.[p.pillar.toLowerCase()]?.outcome || "Pending")}</p>
      <p>Steward pillar judgement: {String(appraisal?.[p.pillar.toLowerCase()]?.descriptor || "Pending")}</p>
    </div>)}
    <section aria-label="Chief Steward summary">
      <h3>Chief Steward summary</h3>
      {managerForm ? <>
        <h4>Overall assessment</h4><p>{String(managerForm.content.overall || "Not recorded")}</p>
        <h4>Summary</h4><p className="long-copy">{String(managerForm.content.summary || "Not recorded")}</p>
      </> : <p>Awaiting Chief Steward appraisal</p>}
    </section>
  </Card>;
}
