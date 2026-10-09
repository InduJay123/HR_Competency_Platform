# Review workflow and developer instructions

1. HR sets company details, departments, job roles, people and acyclic reporting lines. Invitations activate individual accounts. The employee's `joined_on` is their joining date, not a company founding date.
2. Managers assign direct-report work with expected outcome, priority and deadline. Employees record progress, blockers, next steps, results and evidence. Delegation creates a child task and preserves parent accountability.
3. HR creates a Mid-Year (January–June) or Year-End (July–December) cycle, previews participants and appoints an independent Head of HR. Each participant must have an active reporting manager. Year-End additionally requires their final Mid-Year record.
4. Employee and manager prepare independent drafts. Autosave uses the review version. A 409 must preserve local changes and prompt reconciliation; never silently overwrite. Manager appraisal includes contribution, potential, ECP, five pillars, supporting evidence, stewardship and context.
5. Submission seals that form round. The manager can read a submitted employee reflection. Once both forms are submitted, the employee can read the manager appraisal before the conversation. Both submissions are necessary before AI or the shared conversation. The explicitly appointed Head of HR validates each selected source or excludes it with a reason; the Head of HR role alone is insufficient. Only validated excerpts go to AI. A missing-evidence case stays visible; it never invents performance data.
6. Only the employee runs AI coaching, after both forms are submitted and selected evidence has been validated or excluded. The existing analysis service receives both complete forms, including five-pillar narratives/descriptors, ECP rationale, development areas and review-period context. Employee, assigned manager and Head of HR can view stored coaching. HR may still accept/reject guidance with notes, but that decision is separate from stage completion and never sets the official human assessment. New finalisations require successful coaching; a human-only reason no longer bypasses this requirement.
7. After AI coaching, employee and manager separately confirm their own conversation participation. There is no conversation form. Both confirmations unlock one shared commitment list. Either participant may add/edit actions with an employee/manager owner, support, success measure and due date. Saving an edit clears previous plan confirmations. Both participants confirm the final plan, which locks normal editing. HR can view it but cannot edit or confirm on their behalf. Head of HR separately records the final human assessment and rationale; this remains required before acknowledgement so people review the final assessment.
8. Employee and manager each acknowledge the shared final record after both commitment confirmations. Acknowledgement means “I have reviewed this final record”, not agreement with every statement. The employee may provide optional comments (up to 10,000 characters). A manager cannot write those comments or replace an existing acknowledgement. HR cannot acknowledge for either participant. Changes after acknowledgement require a formal revision.
9. The independent appointed Head of HR finalises only after both submissions, successful coaching, both participation confirmations, both commitment agreements, both acknowledgements, the human assessment and existing evidence validation requirements are complete. The API returns every missing prerequisite. The immutable snapshot includes history and provenance. A revision archives conversation/confirmation evidence, assessment, acknowledgements, employee comments and commitment values in the existing ReviewEvent history before opening a new round. Previous submissions and analyses remain stored; commitment IDs are preserved. A final record cannot be reopened through the current API.
10. Live development updates and evidence remain outside the frozen agreement. Year-End compares each Mid-Year commitment as Met / Partially Met / Missed with rationale. The manager completes this comparison before submitting the Year-End appraisal.

States: OPEN → PREPARING → SUBMITTED → ACKNOWLEDGEMENT_PENDING → FINALISED. Both commitment confirmations trigger ACKNOWLEDGEMENT_PENDING. Intermediate stages are derived from actual records, not additional state columns. REVISION_REQUESTED opens a new submission round. Legacy CONVERSATION_READY records remain supported.

Senior leaders use the same defensible workflow with additional strategic outcome, leadership support and sustainable-system fields. Do not claim the platform autonomously evaluates or ranks senior management. The authorised human assessment is the formal evaluation.

## Source interpretation

The client-supplied formal Stewardship Performance Appraisal Form and Manager's Completion Guide inform the ECP, pillars, tools, diagnosis, commitments and acknowledgement content. The separate Self-Evaluation Guide/Form are explicitly personal pre-workshop materials, not documents for an HR file. Do not collect the private WHY, personal workshop reflections or willingness-to-share answers into formal reviews or AI inputs. The digital employee reflection asks for work-related evidence and context only. The approved product flow's two formal cycles supersede the older guide's 90-day check-in suggestion; no 90-day evaluation workflow exists.

## Compatibility and storage

No database migration or backfill is required. Participation and commitment agreements use `Review.conversation.workflow`, scoped by `round`, with separate employee/manager actor IDs and timestamps. Existing discussion text is retained. Acknowledgements use the existing timestamp fields. Commitment edits update existing rows by ID and log previous/new values; no commitment deletion is performed.

Successful existing `Analysis` rows are displayed as Complete regardless of HR acceptance or current provider configuration. Loading a review does not rewrite its data or enqueue coaching. New requests reuse successful current-round output. Older rounds remain visible in AI history. Existing submitted forms and acknowledgement timestamps remain visible. Missing participation/commitment confirmations remain Pending; old final snapshots stay sealed and final even if they predate those confirmations.

The existing `ai-coaching`, `conversation`, `acknowledge`, `revision` and `complete` routes are reused. `conversation` now accepts `{version}` and confirms only the authenticated participant. New routes are limited to the missing actions:

- `POST reviews/{id}/commitments/`: `{version, commitment: {owner, action, due_date, success_measure, manager_support}, commitment_id?}`. Omit ID to add; include an existing ID to edit.
- `POST reviews/{id}/confirm-commitments/`: `{version}`.
- `POST reviews/{id}/human-assessment/`: `{version, assessment: {overall, rationale}}`, appointed Head of HR only.

All mutations retain row locking and optimistic review versions. Clients must reload after changes and reconcile a 409 rather than overwrite another participant's edits. Development follow-up after finalisation remains supported outside the immutable final snapshot.

## Local verification

From the repository root, start the existing configured Django installation with `backend/.venv/Scripts/python.exe backend/manage.py runserver 127.0.0.1:8000 --noreload`. In a second terminal run `npm.cmd run dev` from `frontend`. Restart the existing Celery worker after backend changes if using queued execution; the current development settings use eager execution. Keep existing data and configuration; do not seed or reset the database. No migration command is needed for this change.

Use separate browser profiles for employee, assigned manager and appointed Head of HR:

1. HR creates/launches a cycle, or opens an existing unfinalised review. Confirm old reflection/appraisal/coaching content still appears.
2. Submit the employee reflection. Confirm Run AI Coaching explains that the manager appraisal is pending; direct API requests must fail too.
3. Submit the manager appraisal. HR validates/excludes any pending evidence. Employee runs coaching with the existing configured n8n integration. Observe Running, then Complete and the saved result on all three accounts. An unconfigured provider blocks new coaching but never hides stored results.
4. Employee confirms conversation participation. Commitments stay locked until the manager separately confirms. HR has neither confirmation button.
5. Employee adds a shared commitment; manager edits that same item. Confirm editing after one agreement clears it. Both confirm the plan; editing locks.
6. HR records the independent human assessment. Employee and manager each acknowledge. Optional employee disagreement is retained. HR sees explicit missing prerequisites until all stages finish.
7. HR selects Validate and Finalise Review and confirms. Verify the snapshot and locked controls. Follow-up development updates remain separate.
8. On another unfinalised review, request a revision. Verify older submissions, AI results, archived confirmations/assessment/comments and commitment changes remain in history. New-round confirmations start pending.

Automated checks (SQLite test settings never access the configured production/local review database):

```powershell
Set-Location backend
.venv/Scripts/python.exe manage.py check --settings=config.settings.test
.venv/Scripts/python.exe manage.py makemigrations --check --dry-run --settings=config.settings.test
.venv/Scripts/python.exe manage.py test tests.test_reviews tests.test_ai tests.test_accepted_coaching tests.test_extended_workflow tests.test_participant_workflow --settings=config.settings.test --noinput
Set-Location ../frontend
npm.cmd run typecheck
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

SQLite skips the existing PostgreSQL immutable-trigger integration test. Run that check against an isolated PostgreSQL test database before deployment. Live provider output and real browser interaction need the manual flow above; automated coaching tests mock generation.

Verification on this change: Django checks and migration checks pass; no schema changes detected. All 43 frontend tests, TypeScript checks and the production build pass. Frontend lint reports no errors and two existing unused-variable warnings in `review-form.tsx`. Changed backend files pass Ruff. The full backend run executes 114 tests with one PostgreSQL-only skip and three failing assertions in two existing trainer tests (`test_live_adapter_sends_only_conversation_and_persists_reply`, and the two document-input cases of `test_document_only_and_question_keep_document_out_of_storage`). Those same failures reproduce with the original committed review/AI code in an isolated copy; none are review workflow failures.

## Files changed for this workflow

- `backend/apps/reviews/workflow.py` (new), `services.py`, `serializers.py`, `views.py`
- `backend/apps/ai_coach/services.py`, `views.py`, `tasks.py`, `schema.py`
- `backend/tests/test_participant_workflow.py` (new), `test_reviews.py`, `test_ai.py`, `test_accepted_coaching.py`
- `frontend/src/components/review-workflow.tsx` (new), `review-detail.tsx`, `review-coach.tsx`, `hr-review-presentation.tsx`
- `frontend/src/components/review-workflow.test.tsx` (new), `review-detail.test.tsx`, `hr-review-detail.test.tsx`
- `frontend/src/lib/reviews.ts`
- `docs/review-workflow.md`

The existing Docker and settings edits are unrelated user changes. Models, migrations, production/local records, and final snapshots are not modified by deployment of this code.
