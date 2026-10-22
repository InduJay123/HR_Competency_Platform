# Deployment and recovery

## Separate Platform Administration portal

The same Next.js frontend, Django backend and database serve both portals. No
schema change or migration is required for this feature. This repository does
not contain the VPS Caddyfile; apply the following changes on the deployment.

### DNS and routing

In Namecheap Advanced DNS, add an **A record**, host **admin**, value **the same
public IPv4 address as the existing BTFL VPS**, TTL **Automatic**. If IPv6 is
used, add an AAAA record only for a working IPv6 address on that VPS. The exact
VPS IP must come from the existing deployment, not from this repository.

Keep the existing Caddy site and its custom directives. Add this separate site
block to its existing Caddyfile (same Docker network as the upstreams):

```caddyfile
admin.btflplatform.com {
    handle /api/* {
        reverse_proxy backend:8000
    }
    handle {
        reverse_proxy frontend:3000
    }
}
```

Retain the equivalent `/api/*` -> `backend:8000` and other requests ->
`frontend:3000` handling on btflplatform.com. Preserve Host to Django; do not
replace it with `backend`. Caddy supplies X-Forwarded-Proto. Keep ports 80/443
available for Caddy certificates. Validate and reload using the actual Caddy
container name and mounted configuration path, for example:

```sh
docker exec <caddy-container> caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

### Environment

Set these server-side variables on **both frontend and backend**, and on the
worker that sends reset emails:

```dotenv
FRONTEND_URL=https://btflplatform.com
ADMIN_FRONTEND_URL=https://admin.btflplatform.com
```

Append to the backend's existing lists without removing local, Docker or VPS
entries:

```dotenv
ALLOWED_HOSTS=localhost,127.0.0.1,backend,btflplatform.com,www.btflplatform.com,admin.btflplatform.com
CSRF_TRUSTED_ORIGINS=https://btflplatform.com,https://www.btflplatform.com,https://admin.btflplatform.com
```

Retain any existing required local origins in CSRF_TRUSTED_ORIGINS too.
Use `DJANGO_SETTINGS_MODULE=config.settings.production` for deployed backend,
worker and beat. Set `TRUST_PROXY_HTTPS=true` only with backend access restricted
to trusted proxies, which overwrite X-Forwarded-Proto. This permits HTTPS
recognition behind Caddy and the internal Next.js session check while keeping
Secure cookies and HTTPS redirects enabled. Keep `BACKEND_URL=http://backend:8000`
on the frontend. Rebuild/recreate the frontend and backend, and restart workers
with the new environment.

**Do not use the supplied prodtest settings unchanged in live production.**
`docker-compose.prodtest.yml` currently chooses `config.settings.docker` for
backend/worker/beat; that local-test module overrides allowed hosts and CSRF
origins and disables Secure cookies and SSL redirection. Use a production
Compose override selecting `config.settings.production` for all three services.
The frontend service now passes FRONTEND_URL and ADMIN_FRONTEND_URL from the
Compose environment. No live environment files were modified for this feature.

### Access behavior and cookies

`frontend/src/lib/portal.ts` centralizes the configured host and fixed redirect
destinations; `src/proxy.ts` routes before rendering. `/platform` and all nested
routes redirect from the normal host to the admin origin. On the admin host,
ordinary workspace, registration and request-status routes return to the main
origin. Root goes to admin login. The server-rendered platform layout verifies
the session with Django, forwarding the original Host and session cookie and
disabling caching. Anonymous or unauthorized sessions go to same-host login.

The existing `/api/v1/auth/login/` validates credentials first, then uses
`is_superuser` and the configured admin host to authorize the portal. It records
the login hostname in the Django session. Middleware rejects cross-host session
replay and incompatible account/portal combinations; platform API permissions
also require the admin host and bound session. The existing profile/photo UI and
billing/company/request operations keep their routes and business rules.

Normal login offers only Chief Steward and Steward Guy. Admin login uses the
same BTFL styling, credentials, recovery system and form components, with a
Platform Administration label and Back to BTFL link, and no role or registration
controls. Sign out continues to `/auth/login` on the current host. Reset emails
for superusers use ADMIN_FRONTEND_URL; other accounts use FRONTEND_URL.

Repository settings already used host-scoped cookies. Session and CSRF Domain
remain unset; HttpOnly session cookies and SameSite=Lax remain unchanged, and
production retains Secure cookies. Existing superuser sessions must sign in
again on the admin portal because they lack the new host binding. Ordinary
legacy sessions continue on the normal host. This feature does not clear stored
sessions or change account data. Cookies from a different subdomain are not
automatically sent to the admin portal.

### Local testing

Local development now supports **http://localhost:3000/admin/login** directly.
Normal login remains **http://localhost:3000/auth/login**. The same paths work
on 127.0.0.1. No Windows hosts-file change is required. `/platform` remains
server-protected; unauthorized local requests return to `/admin/login`.

The admin form calls `/api/v1/auth/admin-login/`, which subclasses the existing
credential-validation flow and still requires `is_superuser`. Local development
and local Docker settings enable LOCAL_ADMIN_LOGIN_ENABLED; production settings
explicitly disable it. The endpoint remains restricted to the configured admin
host in production. A local admin session stores its authorized mode as well as
its hostname; the URL alone cannot create that authorization. Revoking superuser
status removes access on subsequent requests. Admin logout returns to the local
admin login, or the admin-host login in production.

Because both local forms use one hostname, they share one browser session;
signing into another account replaces that session. Use separate browser
profiles to test both accounts simultaneously. Production sessions remain
host-separated. No database changes were made.

The admin.localhost setup below is optional for testing subdomain behavior;
it is no longer required for routine local development.

Run the normal backend and Next.js on ports 8000/3000. Set on the backend and in
frontend `.env.local` (or process environment):

```dotenv
FRONTEND_URL=http://localhost:3000
ADMIN_FRONTEND_URL=http://admin.localhost:3000
```

Include `localhost,127.0.0.1,admin.localhost` in backend ALLOWED_HOSTS and all
three `http://<host>:3000` origins in CSRF_TRUSTED_ORIGINS. Existing `.env` values
override the default lists, so update them explicitly. Visit localhost:3000 or
127.0.0.1:3000 for normal login and admin.localhost:3000 for admin login. If the
OS does not resolve admin.localhost, map it to 127.0.0.1 in the hosts file. Use
IPv4 if localhost resolves to IPv6 while the development servers bind IPv4.
The local admin URL enables a narrowly restricted forwarded-host fallback for
Next.js's local API rewrite; production origins never use that fallback.

After deploying, smoke-test both hosts with separate browser sessions: normal
roles, admin login, wrong-role denial, direct platform URLs, profile photo,
company requests, billing, recovery email links and logout. Confirm Set-Cookie
has Secure and no Domain attribute, and that login without CSRF is rejected.
Live DNS, certificate provisioning and VPS routing require deployment and were
not modified from this workspace.

### Implementation files and verification (22 October 2026)

Changed or added for this feature:

```text
.env.example
docker-compose.prodtest.yml
docs/deployment.md
backend/common/portal.py
backend/config/settings/base.py
backend/config/settings/production.py
backend/config/settings/test.py
backend/apps/accounts/views.py
backend/apps/accounts/services.py
backend/apps/companies/platform.py
backend/tests/portal_helpers.py
backend/tests/test_portal.py
backend/tests/test_platform_access.py
backend/tests/test_billing.py
backend/tests/test_suspension.py
backend/tests/test_profile_picture_storage.py
frontend/next.config.ts
frontend/src/proxy.ts
frontend/src/lib/portal.ts
frontend/src/lib/portal.test.ts
frontend/src/components/login.tsx
frontend/src/components/login.test.tsx
frontend/src/app/auth/login/page.tsx
frontend/src/app/platform/layout.tsx
frontend/src/app/platform/layout.test.tsx
frontend/src/app/api/v1/company-logo/[id]/route.ts
```

Validation results:

- `python manage.py check`: no issues.
- `python manage.py test tests.test_portal tests.test_platform_access tests.test_billing tests.test_suspension tests.test_profile_picture_storage tests.test_foundation --settings=config.settings.test --noinput`: 90 tests passed (isolated SQLite test database).
- `npm run typecheck`: passed.
- Focused Vitest portal, login, platform server-layout and logo-proxy suites: 12 tests passed.
- `npm run build`: passed.
- ESLint on the changed frontend source/test files: passed.
- `npm run lint`: blocked by two errors in unchanged `pillar-targets.tsx` (set-state-in-effect) and `review-form.tsx` (refs), plus eight existing warnings. Review code was not changed.
- Eight HTTP checks against a running production Next.js build and isolated local Django server passed: normal/admin login HTML, normal-host platform redirect, anonymous platform and billing route guards, admin root, normal workspace and registration redirects.

These checks do not replace post-deployment testing of real DNS, TLS, Caddy,
PostgreSQL, SMTP delivery and production browser cookies.

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
credentials or signed URLs. Logo reads now require authentication and the selected
company's active membership, or existing platform-admin authorization. Anonymous
branded sign-in pages cannot load these private logo bytes. Upload access remains
restricted to the company's authorised HR. Suspended-user logo access remains
denied, consistent with the session response omitting suspended-company logos.
The shared membership helper and suspension rules are unchanged.

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
Django authorizes logo delivery before reading Storage. The Next.js logo proxy
uses Node's HTTP transport to preserve the browser Host header; Node fetch drops
a custom Host header, which otherwise causes PORTAL_ACCESS_DENIED for sessions
bound to localhost when the internal upstream is 127.0.0.1. Authorized image
responses use private, no-store caching. This permission/proxy fix requires no
database migration.

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

## Two-level reporting release

See `two-level-audit.txt` for the dependency audit and `two-level-report.txt` for
the exact migration, test, Git and VPS commands. Stop web and worker processes
before applying organisation `0005` and companies `0007`: old application code
requires the removed reporting table and manager flag. Run `audit_reporting`
first and preserve a verified backup. These hierarchy migrations are deliberately
not reversible; use forward fixes or restore the complete pre-release backup.

## Acceptance gates
- All automated backend/frontend checks pass; browser journey verified for Employee and Head of HR, including the Head of HR's My Team workspace.
- PostgreSQL immutability and tenant access tests pass.
- Provider integration, source citation, prompt-injection, refusal, retry and human-only review tests pass.
- Accessibility: keyboard, focus, error association, reduced motion, responsive overflow and screen-reader labels.
- Production rate limits, secure reset delivery, secret rotation, audit retention and incident response.
- Tested restore, documented rollback and customer approval of formal evaluation content.
