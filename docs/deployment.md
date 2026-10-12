# Deployment and recovery

## Release boundary
The local app is not a production release. Before customer deployment, finish Figma screen parity and end-to-end acceptance, configure real services, run security/accessibility/load checks and a backup/restore drill. Do not use the development seed or DEBUG settings with customer data.

## Production topology
Deploy Next.js behind TLS with `/api/v1` routed to Django. Use Linux Gunicorn containers and separate Celery worker/beat processes. Configure `DJANGO_SETTINGS_MODULE=config.settings.production`, a random secret, explicit ALLOWED_HOSTS/CSRF origins, secure cookies, PostgreSQL with TLS and Redis on a private network. Run migrations with a separate privileged deployment role; the runtime database role must not be a superuser or migration owner.

Set `PRIVATE_STORAGE_BACKEND=supabase`; configure the HTTPS project URL, a **private** storage bucket and backend-only service key. Never expose the service key to Next.js/browser environment. Verify unauthenticated bucket access fails and authorised downloads succeed. Add upload quarantine and malware scanning before accepting customer files; MIME signatures and forced attachment download are not a malware scanner.

Configure SMTP, a verified sender and worker delivery monitoring. Set FRONTEND_URL to the public HTTPS origin so invitation/reset links point to the correct site. Run the n8n integration checklist in ai.md using synthetic data before live appraisal content.

The supplied Docker Compose database/Redis ports bind only to loopback. Compose app services are a local deployment scaffold, not an internet-ready stack. Pin all container images by reviewed digest for a release and keep OS/base images patched.

## Deployment sequence

### Company logos

Company logo uploads use the existing backend-only `SUPABASE_URL` and
`SUPABASE_SERVICE_KEY` settings and the `company-logos` bucket. Both supplied
Compose configurations load these from `.env`; no frontend credentials or media
volume are needed. This bucket is separate from `SUPABASE_STORAGE_BUCKET`, which
continues to control private review evidence. New logos always use Supabase,
including when evidence uses local development storage.

Apply the additive migration before starting the updated backend:

```sh
python manage.py migrate companies
# VPS/local production-test Compose equivalent:
docker compose -f docker-compose.prodtest.yml run --rm backend python manage.py migrate companies
```

`companies_company.logo_storage_path` stores `<existing-company-uuid>/logo-<random-uuid>.png`.
The existing `logo_url` remains the frontend display reference. The unchanged
`/api/v1/company-logo/<company-id>/` route fetches the stored object server-side
and returns PNG bytes. It works with public or private buckets without exposing
credentials or signed URLs. Logo reads remain public, as required by the existing
branded sign-in page; upload access remains restricted to the company's authorised HR.

Existing `logo_data` bytes are preserved and served when no storage path exists.
Migration `0006` clears only loopback `logo_url` values whose path exactly matches
the same company's logo endpoint, with no query/fragment, and only if a stored
logo exists. External/custom URLs, image bytes and storage paths are preserved.
There is no bulk image migration or object deletion. Replacement uploads
finish before the database reference changes; upload failure preserves the old
reference. Old objects and legacy binary backups are retained. A database failure
after a successful upload can leave an unreferenced object, which should only be
cleaned up after comparing stored references. Do not roll back this migration
after new uploads without first preserving those references.

Verify locally and after deployment: upload via Company settings, inspect the
object under the same company UUID in `company-logos`, and confirm the same-origin
logo route returns `200` with `Content-Type: image/png`. Check the workspace and
branded sign-in page, then replace the image. Existing companies without a new
upload must still render their legacy logo. Keep `FRONTEND_URL` set to the public
site origin as before; the frontend resolves uploaded-logo routes against the
current site. No bulk migration or re-upload of existing logos is required.

The logo route has a dedicated Next.js server proxy. It reads `BACKEND_URL` at
request time rather than using a build-time rewrite. Docker defaults to
`http://backend:8000`; Compose supplies the same internal address. Local `next dev`
defaults to local Django on port 8000. For `next start` outside Docker, explicitly
set `BACKEND_URL` to the reachable Django origin. This variable is server-only.
Other API endpoints retain the existing rewrite. Rewrites run as fallbacks so
they do not intercept the dynamic logo proxy. Keep `company-logos` private;
Django performs authenticated Storage reads, while its existing logo delivery
endpoint remains public for branded sign-in.

From the VPS repository checkout after pushing the changes:

```sh
git pull --ff-only
docker compose -f docker-compose.prodtest.yml build backend frontend
docker compose -f docker-compose.prodtest.yml run --rm backend python manage.py migrate companies
docker compose -f docker-compose.prodtest.yml up -d backend frontend
docker compose -f docker-compose.prodtest.yml logs --tail=50 backend frontend
```

Use the VPS's existing Compose override/port mapping if it differs from this
repository's loopback port 3000 mapping; do not replace its external routing.
If nginx/Caddy forwards `/api/` directly to Django, keep that upstream pointed to
the backend. Otherwise forward to Next.js, which handles the logo proxy. The VPS
reverse-proxy configuration is not included in this repository.

### Release steps

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
