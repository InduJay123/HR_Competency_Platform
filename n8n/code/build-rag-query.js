const body = $json.body ?? $json;
if (!body.request || typeof body.request !== 'object') {
  throw new Error('INVALID_REQUEST: body.request is required');
}
let reviewInput;
try {
  reviewInput = typeof body.request.input === 'string'
    ? JSON.parse(body.request.input) : body.request.input;
} catch { throw new Error('INVALID_REQUEST: request.input is not valid JSON'); }
if (!reviewInput || typeof reviewInput !== 'object' || !Array.isArray(reviewInput.sources)) {
  throw new Error('INVALID_REQUEST: review sources are required');
}

const pillars = ['context', 'character', 'capability', 'continuity', 'contribution'];
const fields = ['target', 'success_measure', 'expected_behaviour', 'employee_reflection',
  'head_of_hr_appraisal', 'outcome', 'steward_judgement'];
const sources = reviewInput.sources;
const employee = sources.find(s => s.type === 'EMPLOYEE_SUBMISSION')?.content ?? {};
const manager = sources.find(s => s.type === 'MANAGER_SUBMISSION')?.content ?? {};
const parts = ['Stewardship coaching methodology for documented review context.',
  'Targets and measures are expectations, not achieved results. Human assessments are authoritative.'];

// Bounded space for EVERY pillar/field, including short targets and judgements.
// Only retrieval is shortened; the full original request goes to coaching.
for (const pillar of pillars) {
  const target = sources.find(s => s.type === 'PILLAR_TARGET' &&
    s.content?.pillar?.toLowerCase() === pillar)?.content ?? {};
  const appraisal = manager.pillars?.[pillar] ?? {};
  const row = reviewInput.pillar_reviews?.[pillar] ?? {
    target: target.target, success_measure: target.success_measure,
    expected_behaviour: target.expected_behaviour ?? target.notes,
    employee_reflection: employee.pillars?.[pillar],
    head_of_hr_appraisal: appraisal.narrative, outcome: appraisal.outcome,
    steward_judgement: appraisal.descriptor,
  };
  for (const field of fields) {
    const value = row[field];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${pillar}.${field}: ${value.trim().slice(0, 250)}`);
    }
  }
}
// Preserve legacy/overall development and documented-gap retrieval signals.
for (const [role, content] of [['employee', employee], ['head_of_hr', manager]]) {
  for (const key of ['gaps', 'barriers', 'support', 'development_actions', 'intervention',
    'summary', 'strengths', 'leadership_support', 'strategic_outcomes']) {
    const value = content[key];
    if (typeof value === 'string' && value.trim()) parts.push(`${role}.${key}: ${value.trim().slice(0, 120)}`);
  }
}
return [{ json: {
  run_id: body.run_id, input_hash: body.input_hash,
  rag_query: parts.join('\n').slice(0, 12000),
  requested_document_key: body.knowledge_document_key ?? null,
} }];
