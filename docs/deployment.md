# Deployment and recovery

## Release boundary
The local app is not a production release. Before customer deployment, finish Figma screen parity and end-to-end acceptance, configure real services, run security/accessibility/load checks and a backup/restore drill. Do not use the development seed or DEBUG settings with customer data.

## Production topology
Deploy Next.js behind TLS with `/api/v1` routed to Django. Use Linux Gunicorn containers and separate Celery worker/beat processes. Configure `DJANGO_SETTINGS_MODULE=config.settings.production`, a random secret, explicit ALLOWED_HOSTS/CSRF origins, secure cookies, PostgreSQL with TLS and Redis on a private network. Run migrations with a separate privileged deployment role; the runtime database role must not be a superuser or migration owner.

Set `PRIVATE_STORAGE_BACKEND=supabase`; configure the HTTPS project URL, a **private** storage bucket and backend-only service key. Never expose the service key to Next.js/browser environment. Verify unauthenticated bucket access fails and authorised downloads succeed. Add upload quarantine and malware scanning before accepting customer files; MIME signatures and forced attachment download are not a malware scanner.

Configure SMTP, a verified sender and worker delivery monitoring. Set FRONTEND_URL to the public HTTPS origin so invitation/reset links point to the correct site. Run the n8n integration checklist in ai.md using synthetic data before live appraisal content.

The supplied Docker Compose database/Redis ports bind only to loopback. Compose app services are a local deployment scaffold, not an internet-ready stack. Pin all container images by reviewed digest for a release and keep OS/base images patched.

## Deployment sequence
1. Build and scan backend and frontend artifacts. Run tests against the same PostgreSQL major version as production.
2. Back up database and private storage. Record application revision, migration set and storage inventory.
3. Apply migrations once under the migration role. Never run migrations from every web worker.
4. Deploy web and workers, then smoke-test login, CSRF, tenant isolation, assignment, private evidence, review submission and manual finalisation.
5. Test AI success/failure and monitor queue health, error rates, response latency and storage access denials. Logs must not contain passwords, keys, appraisal narratives or evidence bodies.
6. Validate the complete role journey with customer-approved synthetic identities before allowing real users.

## Backup / restore / rollback
Use encrypted database backups plus point-in-time recovery where available. Back up private storage objects and their database metadata together. Keep off-site copies with least-privilege access and a documented retention policy. A backup is not accepted until restored to an isolated environment and reviewed.

For a local rehearsal, use the provided `scripts/backup-local.ps1` and `scripts/verify-restore.ps1`. They target the Compose development database and a separate temporary verification database; they do not restore over the active database. Production recovery needs deployment-specific credentials, keys, bucket snapshots, RPO/RTO and owner sign-off.

Rollback the application image only if it remains compatible with applied migrations. Do not reverse immutable-record migrations or discard review rows to make an old build run. Prefer forward fixes; rehearse any migration rollback with restored data first.

## Acceptance gates
- All automated backend/frontend checks pass; browser journey verified for Employee, Manager and Head of HR.
- PostgreSQL immutability and tenant access tests pass.
- Provider integration, source citation, prompt-injection, refusal, retry and human-only review tests pass.
- Accessibility: keyboard, focus, error association, reduced motion, responsive overflow and screen-reader labels.
- Production rate limits, secure reset delivery, secret rotation, audit retention and incident response.
- Tested restore, documented rollback and customer approval of formal evaluation content.
