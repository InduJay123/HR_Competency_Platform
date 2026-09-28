# Beyond the Finish Line — saved platforms

Saved 27 September 2026 from the working application in `D:\BFL`.

**Developer handoff:** [Logins, startup and both AI connections](DEVELOPER%20GUIDE%20-%20LOGINS%20AND%20AI%20SETUP.md). Start with this guide when connecting the AI API or running the saved copy.

Both platforms are included in this connected application:

| Platform | Preview | Responsibility |
| --- | --- | --- |
| Bradley Emerson — Super Admin | http://127.0.0.1:3000/platform | Company approvals, pricing, joining details and reports |
| Beyond the Finish Line — Company | http://localhost:3000/hr/dashboard | HR, managers, employees, work, evidence, reviews, growth and Steward |

The `.url` shortcuts open these previews when the server is running. Distinct hostnames allow both sessions to remain signed in together. Access is enforced by the shared backend.

## Saved contents

- `frontend/`: both interfaces, latest navigation icons, interactive journey and animated Steward.
- `backend/`: authentication, approvals, company and employee codes, pricing, evaluations and AI connections.
- `frontend/public/`: logos and assets.
- `backups/btfl-final-20260927.dump`: database snapshot, including accounts, companies and saved records. Successfully restored in an isolated verification database.
- `docs/`: user guide, developer guide, local login details and AI setup instructions.
- `previews/`: reference screenshots.
- `.env`: existing private local configuration for restoration.

Dependencies, build caches, temporary logs and old backups are omitted. The running preview remains served from `D:\BFL`. This save does not move that server or replace the active database.

## Run from the saved folder later

Prerequisites: Python 3.12+, Node.js 22+ and Docker Desktop. Stop the previous frontend/backend processes before starting another instance on ports 3000 and 8000.

```powershell
Set-Location 'D:\BTFL Final'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
docker compose up -d db redis
.\.venv\Scripts\python.exe backend/manage.py migrate
Set-Location frontend
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Run the backend in a second terminal:

```powershell
Set-Location 'D:\BTFL Final'
.\.venv\Scripts\python.exe backend/manage.py runserver 127.0.0.1:8000 --noreload
```

On this computer, Compose project `bfl` reuses the existing database volume. The dump is a recovery point and is not automatically imported. Use `docs/deployment.md` for recovery guidance. `scripts/verify-restore.ps1` tests a backup in a separate temporary database.

The copied developer documentation retains references to the original `D:\BFL` working directory. When running this saved copy, substitute `D:\BTFL Final` and quote paths containing spaces. Background worker and scheduler commands are in `README.md`.

Credentials: `docs/LOCAL_PREVIEW_LOGINS.md`. Live AI still requires the server OpenAI configuration described in `docs/TRAINER_SETUP.md`. This is a local save; no public deployment or Figma update was made.

`FILE_MANIFEST.csv` contains SHA-256 checksums for the saved files.
