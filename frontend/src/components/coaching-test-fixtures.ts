import type { Analysis } from "./review-coach";

type Coaching = NonNullable<Analysis["output"]>["pillar_coaching"];
export function pillarCoaching(context: Coaching["context"]): Coaching {
  const empty = () => ({ strengths: [], gaps: [], support_options: [], limitations: [] });
  return { context, character: empty(), capability: empty(), continuity: empty(), contribution: empty() };
}
