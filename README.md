# Beyond the Finish Line

A work → appraisal → improvement platform. **AI assists; humans decide.** The appointed Head of HR validates review evidence and finalises the acknowledged record.

This repository is a new implementation in `D:\BFL`, built from the supplied business flow and Figma file. It is not the earlier static prototype. See [development progress](docs/development-progress.md) for tested functionality and remaining release work. Live AI, Supabase and SMTP are not configured by default.

## Local setup (PowerShell)
Prerequisites: Python 3.12+, Node.js 22+, Docker Desktop with Linux containers.

```powershell
Set-Location D:\BFL
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe scripts/init-local.py
docker compose up -d db redis
.\.venv\Scripts\python.exe backend/manage.py migrate
Set-Location frontend
npm.cmd ci
```

Run Django from the root in one terminal:
```powershell
.\.venv\Scripts\python.exe backend/manage.py runserver 127.0.0.1:8000 --noreload
```
Run Next.js from `frontend` in another:
```powershell
npm.cmd run dev -- --hostname 127.0.0.1
```
Open http://127.0.0.1:3000. Next.js proxies `/api/v1` to Django. Use one hostname consistently for session/CSRF cookies. Restart the `--noreload` backend after Python edits.

The optional `seed_demo` management command requires an explicit `BFL_DEMO_PASSWORD` environment variable of at least 12 characters and development settings. It creates labelled example accounts and work; never run it in production. Production bootstrap uses `bootstrap_company --name ... --slug ... --email ... --first-name ... --last-name ...` and configured email activation, without fixed passwords.

Celery worker (Windows local development only; use Linux containers for production):
```powershell
Set-Location D:\BFL\backend
..\.venv\Scripts\python.exe -m celery -A config worker --pool=solo --loglevel=warning
```

Run the scheduler separately for reminders and interrupted AI-job recovery:
```powershell
Set-Location D:\BFL\backend
..\.venv\Scripts\python.exe -m celery -A config beat --schedule D:\BFL\.celerybeat --pidfile D:\BFL\.celerybeat.pid --loglevel=warning
```
Restart worker and scheduler after Python changes. The Windows solo worker is only a local development convenience.

## Checks
```powershell
Set-Location D:\BFL
.\.venv\Scripts\python.exe backend/manage.py test tests --noinput
.\.venv\Scripts\python.exe -m ruff check backend
.\.venv\Scripts\python.exe backend/manage.py makemigrations --check --dry-run
Set-Location frontend
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run build
```
The default backend tests use a separate PostgreSQL test database. `--settings=config.settings.test` is a fast SQLite alternative and skips PostgreSQL-specific trigger checks; it does not replace them.

## Developer handoff
- [Start here: developer instruction guide](docs/DEVELOPER_GUIDE.md)
- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [API contract](docs/api.md)
- [Permissions](docs/permissions.md)
- [Review workflow](docs/review-workflow.md)
- [AI integration](docs/ai.md)
- [Deployment and recovery](docs/deployment.md)
- [Figma mapping](docs/FIGMA_SCREEN_MAP.md)

Production secrets belong in a secret manager or server environment. Never put OpenAI, Supabase service-role or n8n credentials in browser code or `NEXT_PUBLIC_*` variables.
