# Database and invariants

All domain IDs are UUIDs. Tenant entities have a company foreign key and timestamps. Services validate related IDs against the active company before use.

| Group | Entities | Important invariants |
|---|---|---|
| Identity | User, Company, Membership, EmployeeProfile | Unique email; unique company/user membership; Head of HR implies HR; employee joining date separate from company identity |
| Organisation | Department, JobRole, ReportingRelationship | Tenant-unique names; one reporting manager; no self-manager; service checks cycles under a tenant row lock |
| Work | WorkItem, WorkUpdate | Assignee, assigning manager and accountable owner remain explicit; parent/child delegation does not replace parent's owner; progress is appended |
| Evidence | EvidenceItem | UUID storage key, content hash, author, task, validation state and authorised excerpt; no public bucket URLs |
| Reviews | ReviewCycle, Review, Submission, ReviewEvent | Two allowed cycle kinds; one review per employee/cycle; immutable submitted round; independent reviewer; optimistic version |
| History | FinalSnapshot | JSON contains forms/history, authorised evidence, AI provenance, human assessment, conversation, commitments and acknowledgements; SHA-256 digest; DB blocks update/delete |
| Improvement | Commitment, CommitmentUpdate | Live progress changes separately from the preserved agreement; evidence can attach to updates; optional DEVELOPMENT work |
| AI | Analysis | Unique review/round/input-hash; model/prompt version/input provenance; bounded attempts; human disposition; no writes to assessment fields |
| Activity | Notification, AuditLog | Recipient-private idempotent notifications; immutable audit rows without raw form/evidence bodies |

PostgreSQL migrations install immutability triggers. Fast SQLite tests do not enforce those triggers. Validate real PostgreSQL before release. Application credentials must not own migration functions or have superuser privileges in production; otherwise an administrator can bypass database protections.

Foreign keys use PROTECT for historical identities. Do not delete employees to deactivate access. Implement retention/legal deletion as a reviewed process with customer policy, not an ordinary CRUD button.

Tenant isolation currently uses Django query/service enforcement. Do not expose these database tables directly through public Supabase APIs without a separately tested deny-by-default RLS policy. The Supabase service key is backend-only.
