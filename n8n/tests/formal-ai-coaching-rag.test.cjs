const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const flow = JSON.parse(fs.readFileSync(path.join(root, 'workflows/formal-ai-coaching-rag.json'), 'utf8'));
const node = name => flow.nodes.find(n => n.name === name);
function run(name, json, body, rows = []) {
  return new Function('$json', '$', '$input', node(name).parameters.jsCode)(
    json, () => ({ first: () => ({ json: { body } }) }), { all: () => rows.map(json => ({ json })) }
  )[0].json;
}
const pillars = ['context', 'character', 'capability', 'continuity', 'contribution'];
const pillar_reviews = Object.fromEntries(pillars.map(p => [p, {
  target: `Goal ${p}`, success_measure: '3 days', expected_behaviour: 'Raise risks',
  employee_reflection: '2 days', head_of_hr_appraisal: 'Confirmed', outcome: 'Achieved', steward_judgement: 'Strong',
}]));
function request() {
  return { run_id: 'run', input_hash: 'hash', request: { model: 'model', store: false,
    instructions: 'Human review is authoritative', max_output_tokens: 5000,
    text: { format: { type: 'json_schema', strict: true, schema: { type: 'object' } } },
    input: JSON.stringify({ pillar_reviews, sources: [
      { id: 'employee-source', type: 'EMPLOYEE_SUBMISSION', content: { gaps: 'Delegation', pillars: {} } },
      { id: 'manager-source', type: 'MANAGER_SUBMISSION', content: { gaps: 'Knowledge transfer', pillars: {} } },
    ] }),
  } };
}

test('embedded code matches maintained code files and retrieval wiring stays intact', () => {
  for (const [name, file] of [['Build RAG query', 'build-rag-query.js'], ['Add book context to request', 'add-book-context.js']])
    assert.equal(node(name).parameters.jsCode, fs.readFileSync(path.join(root, 'code', file), 'utf8'));
  assert.match(node('Embed RAG query').parameters.jsonBody, /rag_query/);
  assert.match(node('Retrieve book guidance').parameters.jsonBody, /btfl-stewardship-guide/);
  assert.match(node('OpenAI structured coaching').parameters.jsonBody, /\$json.request/);
  for (const [from, to] of [['Build RAG query', 'Embed RAG query'], ['Embed RAG query', 'Retrieve book guidance'], ['Retrieve book guidance', 'Add book context to request'], ['Add book context to request', 'OpenAI structured coaching']])
    assert.equal(flow.connections[from].main[0][0].node, to);
});

test('all short pillar fields and documented gaps influence retrieval', () => {
  const body = request();
  const result = run('Build RAG query', { body }, body);
  for (const pillar of pillars) for (const [key, value] of Object.entries(pillar_reviews[pillar]))
    assert.ok(result.rag_query.includes(`${pillar}.${key}: ${value}`));
  assert.match(result.rag_query, /head_of_hr.gaps: Knowledge transfer/);
  assert.ok(result.rag_query.length <= 12000);
});

test('large values cannot crowd later pillars out of retrieval', () => {
  const body = request(); const input = JSON.parse(body.request.input);
  for (const row of Object.values(input.pillar_reviews)) for (const key of Object.keys(row)) row[key] = 'Long '.repeat(10000);
  body.request.input = JSON.stringify(input);
  const result = run('Build RAG query', body, body);
  assert.match(result.rag_query, /contribution.steward_judgement:/);
  assert.ok(result.rag_query.length <= 12000);
});

test('legacy source-only requests still produce a target-aware retrieval query', () => {
  const body = request(); const input = JSON.parse(body.request.input);
  delete input.pillar_reviews;
  input.sources.push({ id: 'target', type: 'PILLAR_TARGET', content: { pillar: 'CONTEXT', target: 'Coordinate', success_measure: 'Early', notes: 'Raise risks' } });
  body.request.input = JSON.stringify(input);
  assert.match(run('Build RAG query', body, body).rag_query, /context.expected_behaviour: Raise risks/);
});

test('RAG context preserves review sources, full pillar input and structured schema', () => {
  const body = request(); const before = structuredClone(body);
  const result = run('Add book context to request', {}, body, [{ body: [{ source_id: 'employee-source', content: 'Approved coaching methodology' }] }]);
  const input = JSON.parse(result.request.input);
  assert.deepEqual(input.pillar_reviews, pillar_reviews);
  assert.deepEqual(input.sources, JSON.parse(body.request.input).sources);
  assert.notEqual(input.knowledge_sources[0].id, 'employee-source');
  assert.deepEqual(result.request.text, body.request.text);
  assert.equal(result.request.store, false);
  assert.equal(result.request.model, body.request.model);
  assert.deepEqual(body, before);
  assert.match(result.request.instructions, /NEVER emit knowledge-source IDs/);
  assert.match(result.request.instructions, /never evidence of achievement/i);
});

test('no retrieved knowledge still forwards the review for advisory coaching', () => {
  const body = request(); const result = run('Add book context to request', {}, body, []);
  assert.equal(result.rag.retrieved_count, 0);
  assert.deepEqual(JSON.parse(result.request.input).pillar_reviews, pillar_reviews);
});
