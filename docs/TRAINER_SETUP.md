# Corporate trainer setup

The corner character, Steward, is available throughout the signed-in web platform. Built-in learning guides work immediately. Live conversation is deliberately disabled until both server settings below are configured. No API key has been added to this local project.

## Configure the server

1. Create or use an approved OpenAI API project. Set a budget and access controls in that project. Select a Responses API text model available to that project.
2. Supply `OPENAI_API_KEY` and `OPENAI_TRAINER_MODEL` through the Django server's secret manager or environment. For local development, Django loads `.env` from the project root it runs from: `D:\BTFL Final\.env` for this saved copy, or `D:\BFL\.env` for the original preview. Editing the saved copy does not update a process running from the original folder. Set the trainer model explicitly; a present but empty value does not use the fallback. Do not put the key in frontend files, `NEXT_PUBLIC_*`, screenshots or source control.
3. Restart the Django web process. A frontend rebuild is not needed for credential changes. The existing appraisal analysis integration remains separate and uses n8n credentials as described in `ai.md`.
4. Sign in, select **Ask Steward**, and confirm that **Live AI training** appears. This label indicates settings are present; it is not a successful provider test.
5. Send a synthetic learning question such as “Help me plan a clear delegation conversation.” Confirm a reply arrives, persists after reopening, and appears only to the same account and workspace. A real provider success test has not been performed yet.
6. Test a rejected key or unavailable model in a non-production environment. The screen must preserve the draft and show a service error, with no invented response.

```dotenv
# Server environment only; replace with your own secret and approved model ID
OPENAI_API_KEY=
OPENAI_TRAINER_MODEL=
```

## Behaviour and data boundaries

The backend calls `POST https://api.openai.com/v1/responses` with `store: false`, a corporate learning instruction, the last 20 stored messages and the new question. It does not fetch employee profiles, reviews, evidence or other users' messages. The assistant is a training tool and does not issue formal performance decisions. Structured review coaching remains inside the authorised review workflow.

Successful conversation pairs are stored in PostgreSQL with the owner's membership and tenant. HR has no general conversation-reading endpoint. Infrastructure administrators still have database access: set a company retention/deletion policy and backup controls before rollout. `store: false` is not a claim of zero provider retention; verify the organisation's provider agreement.

Limits: 4,000 characters per message, 100 messages per conversation, 100 conversations per member, 12 API requests per minute, 45-second provider read timeout. Only completed text responses are accepted. The UI preserves failed drafts; unsuccessful requests do not create fake assistant messages. Character motion respects reduced-motion preferences.

## API and maintenance

- `GET /api/v1/trainer/status/` — configuration availability; authenticated membership required.
- `GET/POST /api/v1/trainer/conversations/` — owner-scoped list/create.
- `GET/POST /api/v1/trainer/conversations/{id}/messages/` — owner-scoped history/send.
- Apply migrations before deployment: organisation 0003/0004 and ai_coach 0002.
- Run `python backend/manage.py test tests.test_profiles_trainer tests.test_growth_invitation --noinput` and frontend `npm test`.
- Review dependency versions, egress, service timeouts, usage limits and logs before customer rollout. Never log message bodies or the API key.

Official API reference: [Responses migration and manual context](https://developers.openai.com/api/docs/guides/migrate-to-responses).
