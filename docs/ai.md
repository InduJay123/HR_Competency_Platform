# AI integration — developer handoff

## What is implemented
Celery beat checks every five minutes for jobs abandoned for more than ten minutes. It marks them FAILED / WORKER_INTERRUPTED for an explicit HR retry; it never silently starts another paid provider request. Late results from superseded attempts are discarded. Run and monitor both worker and beat in production.

`backend/apps/ai_coach` persists an analysis request and queues it after the database transaction commits. Only the appointed independent Head of HR can request it, after both formal submissions and source validation. Inputs are the sealed forms and explicitly validated excerpts. Names/contact fields, private files, download URLs and private workbooks are not separately added. Authors may still have written personal data inside a narrative: HR must minimise the authorised content.

The worker calls n8n with a server-only `X-BFL-Token` header. The inactive importable workflow is `n8n/workflows/stewardship-coaching.json`; regenerate it with `scripts/generate-n8n-workflow.py` if needed. n8n calls OpenAI's Responses endpoint with `store:false`, no tools and a strict JSON schema supplied by the backend. It returns the provider response synchronously to the worker; no unauthenticated callback endpoint exists.

Output contains strengths, gaps, support options, discussion questions, uncertainty and limitations. Every observation must reference an ID in the approved input snapshot. Unknown citations, extra rating fields, malformed JSON, refusals or incomplete responses fail validation. The output is not used to assign a rating, ECP category, rank, promotion, pay or other employment decision. A successful contract check does not prove the model's claims are correct: Head of HR must accept/reject with a rationale.

## Configure on the server
1. Import the workflow into a supported n8n instance. It is intentionally inactive and contains no credentials.
2. Create a Header Auth credential named `BFL Backend Webhook`: header `X-BFL-Token`, value a random secret of at least 32 bytes. Assign it to the Webhook node. Set a backend-network IP allowlist where available.
3. Create a separate Header Auth credential named `OpenAI Server Authorization`: header `Authorization`, value `Bearer <server project API key>`. Assign it to the OpenAI HTTP Request node. Never reuse the webhook secret as the provider key.
4. Choose a currently available OpenAI model that supports Responses Structured Outputs and set `OPENAI_MODEL` explicitly. No model is silently chosen. Record the model in the customer's release configuration and evaluation results.
5. Publish the workflow and copy its **production** webhook URL into `N8N_WEBHOOK_URL`. Set matching `N8N_WEBHOOK_TOKEN` on Django/worker. Use HTTPS in production. Set Redis and run a Celery worker.
6. Keep n8n execution payload retention disabled for this workflow. Restrict n8n editor access, encrypt its credentials and set provider spend limits. Confirm customer data processing/retention settings before using real appraisal data.
7. Run integration tests with synthetic data: success, provider refusal, malformed JSON, unknown source, timeout, duplicate request, stale revision and manual completion during provider failure. **These live integration checks have not been run without credentials.**

## Reliability and provenance
The request hash covers the exact source snapshot, model and prompt version. Duplicate requests reuse the same run. Attempts are bounded; connection/timeout failures retry twice. A stale review round cannot become a current successful result. Output, model, provider response ID, prompt version, input hash, source snapshot and human disposition are retained. Final records copy this provenance rather than depending on future model output.

Workers killed while RUNNING or queued work lost during an infrastructure failure are covered by the implemented scheduled reconciliation described above; run and monitor Celery beat as well as the worker. Provider 429/5xx policy and alerting should be verified against the deployed n8n response behaviour. An unavailable AI provider never blocks an otherwise valid human review: Head of HR records the reason.

## Official references used
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): Responses `text.format` JSON schema, strict schema and incomplete/refusal handling.
- [n8n Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook): Header Auth, test versus production URLs and response when the last node finishes.

The workflow is an implementation artifact, not a claim of a tested live OpenAI connection.
