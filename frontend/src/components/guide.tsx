"use client";
import { useSession } from "./shell";
import { tourSteps, useTour, type TourRole } from "./tours";
import { pillarHelp } from "./help";
import { human } from "@/lib/reviews";
import { Button, Card } from "./ui";
export function Guide() {
  const session = useSession(),
    start = useTour();
  return (
    <>
      <p className="eyebrow">GUIDANCE / STEWARDSHIP</p>
      <h1>Make your next step useful.</h1>
      <p className="subtitle">
        Short explanations, practical prompts and optional tours. Reopen them
        whenever you need.
      </p>
      <div className="guide-tour-grid">
        {(["employee", "manager", "hr"] as TourRole[])
          .filter((role) => session.contexts?.includes(role))
          .map((role) => (
            <Card key={role} title={`${human(role)} tour`}>
              <p>Four short steps through your responsibilities.</p>
              <ol>
                {tourSteps[role].map((step) => (
                  <li key={step.title}>{step.title}</li>
                ))}
              </ol>
              <Button onClick={() => start(role)}>Start {role} tour</Button>
            </Card>
          ))}
      </div>
      <Card title="Five pillars, a fuller picture">
        {Object.entries(pillarHelp).map(([pillar, description]) => (
          <article key={pillar}>
            <h3>{human(pillar)}</h3>
            <p>{description}</p>
          </article>
        ))}
      </Card>
      <div className="split">
        <Card title="Contribution, capability and continuity">
          <p>
            <strong>Contribution Conversation:</strong> describe your three most
            meaningful contributions, commitments met or missed, and what
            success should look like next.
          </p>
          <p>
            <strong>Capability Map:</strong> name observable strengths and gaps.
            Agree a practical development action, owner, date and support.
          </p>
          <p>
            <strong>Legacy Tracker:</strong> capture knowledge shared, people
            developed and durable improvements to systems or relationships.
          </p>
        </Card>
        <Card title="Understand the conditions">
          <p>
            ECP considers present contribution and future potential. A quadrant
            points to a support conversation; it is not a numeric score.
          </p>
          <p>
            When performance needs attention, explore ability, motivation,
            opportunity, role fit and manager or system conditions before
            choosing an intervention.
          </p>
          <p>
            AI can suggest evidence-linked questions. People validate sources
            and make formal assessments.
          </p>
        </Card>
      </div>
      <Card title="What is shared">
        <p>
          Draft formal forms stay with their author. Submitted employee
          reflections are shared with the assigned reviewers. Once both forms
          are submitted, the employee can read the manager appraisal before the
          conversation.
        </p>
        <p>
          Acknowledgement records participation and receipt, not necessarily
          agreement. Employees may add comments to the shared final record.
        </p>
        <p>
          The client’s pre-workshop self-evaluation workbook is separate
          personal material. Its private WHY and workshop-sharing reflections
          are not requested here, submitted to HR or included automatically in
          AI analysis.
        </p>
      </Card>
      <small>
        Framework guidance adapted from the client-supplied Stewardship
        Self-Evaluation Guide and Manager’s Completion Guide, based on Beyond
        the Finish Line. Formal cycles follow the approved Mid-Year / Year-End
        product flow.
      </small>
    </>
  );
}
