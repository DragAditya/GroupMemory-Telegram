# GroupMemory — Telegram

**GroupMemory — Telegram** is a self-hostable Telegram bot that gives groups a private, searchable memory. It records message metadata, stores Gemini embeddings, retrieves only relevant evidence, and answers with the original Telegram sources.

The project includes a **Telegram-authenticated dashboard**. Every group administrator can sign in with Telegram and see only the groups where the bot has verified that person as a current administrator. The durable project owner also receives a separate global operations console with bot health and platform-wide statistics.

> **Privacy model:** GroupMemory stores only messages from groups where memory has been enabled. Each group independently controls retention. Answer generation receives retrieved evidence only and is instructed to say when evidence is insufficient.

## Quick start

The following path starts a local development copy. A public HTTPS deployment is required before Telegram can deliver webhooks or complete Telegram Login.

```bash
git clone https://github.com/DragAditya/GroupMemory-Telegram.git
cd GroupMemory-Telegram
pnpm install --frozen-lockfile

# Copy the variable names from docs/environment-template.md into a new local .env file.
# Do not commit the .env file.
pnpm drizzle-kit migrate
pnpm dev
```

Open `http://localhost:3000` after the server starts. Before using the bot in a real group, complete the **Telegram setup** and **first live verification** steps below.

| You need | Why it is required |
| --- | --- |
| Node.js 22+ and pnpm 10+ | Runs the TypeScript server, React dashboard, and test tooling. |
| TiDB or MySQL-compatible database with TiDB vector support | Persists group metadata and 768-dimension vector embeddings. Plain MySQL without vector functions is not sufficient for semantic retrieval. |
| Telegram bot from BotFather | Receives group updates and confirms dashboard identities. |
| Google Gemini API key | Creates embeddings and grounded responses. |
| Public HTTPS URL for production | Required for Telegram webhooks, Telegram Login, Vercel, Render, or another public host. |

## What it does

| Capability | Behavior |
| --- | --- |
| Message memory | Records text, sender, username, UTC time, replies, links, media IDs, mentions, topics, and original Telegram links. |
| Strict retention | Each group chooses **7, 30, or 90 days**. Expired records are deleted in bounded batches. |
| Semantic search | Creates 768-dimension Gemini embeddings and uses TiDB vector similarity search. |
| Grounded answers | `/ask`, `/search`, and bot mentions return named, dated source messages and Telegram links. |
| Admin controls | Only Telegram group admins can enable/disable memory or change retention. |
| Personal dashboard | Telegram-authenticated administrators see only their currently verified groups, including memory state, retention, activity, and retained-message counts. |
| Owner operations | The configured project owner retains a separate global console, direct add-to-group controls, bot health, and platform-wide statistics. |

## Architecture

```text
Telegram group message
        │ HTTPS webhook
        ▼
Express API ──► TiDB / MySQL metadata + vector records
        │                         │
        │                         ▼
        │                   vector similarity search
        ▼
Google Gemini ──► evidence-only answer ──► Telegram reply with sources
```

## Bot commands

| Command | Who can use it | Result |
| --- | --- | --- |
| `/start` | Anyone | Shows setup and command help. |
| `/memory on` | Group admin | Starts recording messages for the current group. |
| `/memory off` | Group admin | Stops future recording for the current group. |
| `/retention 7d` | Group admin | Keeps messages for seven days. |
| `/retention 30d` | Group admin | Keeps messages for thirty days; this is the default. |
| `/retention 90d` | Group admin | Keeps messages for ninety days. |
| `/status` | Group admin | Shows the group’s memory and retention settings. |
| `/ask <question>` | Anyone in a configured group | Answers from retained evidence only. |
| `/search <query>` | Anyone in a configured group | Returns matching retained messages and links. |
| `@BotUsername <question>` | Anyone in a configured group | Treats a bot mention as an evidence-only question. |

## Detailed local installation

### Requirements

Install **Node.js 22+**, **pnpm 10+**, and a TiDB/MySQL-compatible database. TiDB is required for the provided `VECTOR(768)` schema and cosine-similarity retrieval.

```bash
git clone https://github.com/YOUR-ACCOUNT/groupmemory.git
cd groupmemory
pnpm install --frozen-lockfile
```

Create a local, uncommitted `.env` file using [the environment variable reference](docs/environment-template.md). Fill in every required value. Never place real values in the template, source files, issues, or pull requests.

Then apply the committed database migrations and start the development server:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
pnpm dev
```

`pnpm drizzle-kit generate` is only needed after you change `drizzle/schema.ts`; a fresh clone can run `pnpm drizzle-kit migrate` directly. The local dashboard opens at `http://localhost:3000`. The health check is available at `GET /api/health`.

Run the quality gates before opening a pull request or deployment:

```bash
pnpm check
pnpm test
pnpm build
```

## Required environment variables

| Variable | Purpose | Required |
| --- | --- | --- |
| `DATABASE_URL` | TiDB/MySQL connection string. | Yes |
| `JWT_SECRET` | Signs the dashboard session cookie. Use a random 32+ character value. | Yes |
| `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`, `OAUTH_SERVER_URL` | Manus OAuth configuration used only for the initial project-owner fallback and owner-account linking. | Yes |
| `OWNER_OPEN_ID` | Durable existing project-owner record used to authorize the one-time Telegram owner link. | Yes |
| `TELEGRAM_BOT_TOKEN` | Token from BotFather. Never expose this in the browser or commit it. | Yes |
| `TELEGRAM_WEBHOOK_SECRET` | Secret Telegram sends in the webhook header. | Yes |
| `TELEGRAM_OIDC_CLIENT_ID` | Telegram Login Client ID issued by BotFather. | Yes for dashboard login |
| `TELEGRAM_OIDC_CLIENT_SECRET` | Telegram Login Client Secret issued by BotFather; used only for secure server-side code exchange. | Yes for dashboard login |
| `GEMINI_API_KEY` | Google Gemini API key for embeddings and grounded generation. | Yes |
| `GEMINI_GENERATION_MODEL` | Gemini generation model available to your Google API project. | Yes |
| `CRON_SECRET` | Shared secret for Vercel, Render, or another external retention scheduler. | Yes outside Manus hosting |
| `RETENTION_CRON_URL` | Full cleanup URL used only by the Render cron service. | Render only |

## Telegram setup

1. Create a bot with **BotFather** and copy its token into `TELEGRAM_BOT_TOKEN`.
2. In BotFather, open **Bot Settings → Group Privacy → Turn off**. GroupMemory cannot index normal group messages while privacy mode is on.
3. In BotFather, add the command list from the table above if you want Telegram’s command menu.
4. Deploy the app to a public HTTPS URL.
5. Set the webhook. Replace the two placeholders, but do not paste your bot token or secret into a public terminal history:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "content-type: application/json" \
  --data "{\"url\":\"https://YOUR-DOMAIN/api/telegram/webhook\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"edited_message\"]}"
```

6. Confirm the connection:

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

7. Open the owner dashboard, select **Add bot to a group**, choose the group, make the bot a group admin, and send `/memory on` in that group.

## First live verification

After deployment, use a small test group before connecting a large community. Add the bot, make it an administrator, turn off Group Privacy, then send `/memory on`. Send two ordinary messages with a distinctive phrase, then ask `/search <distinctive phrase>`. Confirm that the result includes source links and India Standard Time timestamps. Finally, tap **Evidence** and reply directly to a GroupMemory answer to confirm the compact evidence and follow-up paths.

For the dashboard, sign in with Telegram. A group appears for an administrator after they send `/status`, `/memory on`, `/memory off`, or `/retention` in that group. The dashboard rechecks administrator status before returning the group data.

## Telegram Login and multi-user dashboard setup

Telegram Login uses OpenID Connect authorization code flow with PKCE. In BotFather, open the Telegram Login configuration for this bot and register the exact deployed website origin and callback URL, for example `https://YOUR-DOMAIN/api/auth/telegram/callback`. Copy the Client ID and Client Secret into `TELEGRAM_OIDC_CLIENT_ID` and `TELEGRAM_OIDC_CLIENT_SECRET`; these values remain server-side.[6]

After deployment, the existing project owner should sign in through the owner fallback once and select **Link Telegram account**. This securely binds the owner’s Telegram identity to the pre-existing project-owner account; it does not grant owner privileges based only on a Telegram numeric ID.

Other group administrators sign in with Telegram. To make a managed group appear in their personal dashboard, they should send `/status`, `/memory on`, `/memory off`, or a `/retention` command in that group. GroupMemory first confirms the sender’s live Telegram administrator status, then records the dashboard grant. At every dashboard refresh, it rechecks that administrator status. A user who is no longer an administrator no longer sees that group.

### One-time bot-code fallback

If the Telegram Login approval callback is unavailable, choose **Link through Telegram bot** on the sign-in screen or owner-link panel. The dashboard creates a high-entropy one-time code and opens the bot deep link. Telegram sends `/start GM-…` in a private chat; GroupMemory binds the code to that exact Telegram sender, then the original browser session completes the sign-in automatically. Codes expire after ten minutes, are stored only as hashes, and can be consumed once. Do not forward the displayed code or the browser page while it is waiting for confirmation.

## Deploy on Vercel

Vercel is suitable for this request-driven webhook server. The included `vercel.json` builds the React client, exposes `api/index.ts` as the Express function, and schedules once-daily cleanup to remain compatible with Vercel Hobby cron limits.

1. Push this repository to GitHub and import it in Vercel.
2. Add every required environment variable from [the environment variable reference](docs/environment-template.md) in **Project Settings → Environment Variables**.
3. Set a strong `CRON_SECRET`. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` when running the configured cron route.[1]
4. Deploy. Use the resulting production URL when registering the Telegram webhook and add `https://YOUR-VERCEL-DOMAIN/api/auth/telegram/callback` to the bot’s allowed Telegram Login URLs.
5. Open **Settings → Cron Jobs** to confirm `/api/scheduled/groupmemory-retention` runs once daily at `0 0 * * *` (UTC).[2]

> Vercel Cron invokes the production URL with an HTTP `GET`; GroupMemory accepts both `GET` and `POST` for its authenticated retention path. Vercel cron schedules and their timezone are configured in `vercel.json`.[2]

> **Vercel Hobby tradeoff:** Vercel Cron runs only against production deployments, uses UTC schedules, and is request-triggered rather than a continuously running worker. The once-daily schedule means an expired message can remain for up to about one additional day. Its `CRON_SECRET` protects the cleanup request. Use Render or a Vercel paid plan when hourly retention cleanup is required.[1] [2]

## Deploy on Render

Render is a good fit when you prefer a standard Node web service plus a separate scheduled service. The included `render.yaml` declares both.

1. In Render, choose **New → Blueprint** and connect this GitHub repository.
2. Enter all fields marked `sync: false` from [the environment variable reference](docs/environment-template.md).
3. Set `RETENTION_CRON_URL` on the `groupmemory-retention` cron service to `https://YOUR-RENDER-DOMAIN/api/scheduled/groupmemory-retention`.
4. Set the **same** `CRON_SECRET` value on both the web service and the cron service.
5. Deploy the web service, then register its HTTPS URL with Telegram. Add `https://YOUR-RENDER-DOMAIN/api/auth/telegram/callback` to the bot’s allowed Telegram Login URLs.
6. Use **Trigger Run** in the Render dashboard to test cleanup. The cron job runs hourly at `0 * * * *` in UTC.[3]

Render cron jobs run separately from the web service, support environment variables, and run one instance of a given cron job at a time.[3]

## Retention scheduler for other hosts

Any scheduler can call the cleanup endpoint. Send the bearer token as shown below:

```bash
curl -X POST "https://YOUR-DOMAIN/api/scheduled/groupmemory-retention" \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

Schedule it hourly. The endpoint deletes in bounded batches and returns JSON with the deleted count.

## Security and operations

- Keep `.env` private. It is ignored by Git and must never be committed.
- Rotate the Telegram token, webhook secret, Gemini key, or cron secret immediately if any is exposed.
- Use a TLS-enabled database connection in production.
- Telegram Login validates PKCE, one-time state, the authorization-code exchange, and the ID token signature, issuer, audience, and expiry before creating a dashboard session.[6]
- A regular dashboard user receives only groups where Telegram confirms that user remains an administrator. Telegram API outages hide the affected group for that response without silently granting access or erasing the prior verified record.
- The global operations console requires the durable project-owner flag. Other application admins and Telegram users cannot access it.
- The webhook checks Telegram’s secret header before processing any update.
- Review the dashboard’s **Latest Telegram delivery note** and Telegram’s `getWebhookInfo` output if messages stop arriving.

## Production checklist

Use the complete [production go-live checklist](docs/production-checklist.md) before connecting a real Telegram group. It covers migrations, secret configuration, HTTPS health checks, webhook registration, owner dashboard access, and retention-job verification.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Bot receives only commands or mentions | Turn **Group Privacy** off in BotFather, remove and re-add the bot if Telegram asks. |
| `/memory on` says admin-only | Make the person who sends it a Telegram group administrator. |
| Dashboard shows no groups | Sign in with Telegram, then send `/status` in the group as a current administrator. Check that the bot is still in the group and can use `getChatMember`. |
| Owner console is present but personal groups are missing | Use the owner fallback once, then select **Link Telegram account** and complete Telegram Login. |
| Telegram Login returns an error | Confirm that BotFather contains the exact deployed callback URL and that `TELEGRAM_OIDC_CLIENT_ID` and `TELEGRAM_OIDC_CLIENT_SECRET` match the BotFather configuration. |
| Telegram Login approval does not return to the dashboard | Choose **Link through Telegram bot**, open the generated bot link, and complete the private `/start GM-…` prompt. Return to the same browser tab until it confirms the link. |
| Webhook errors or pending updates grow | Check `/api/health`, check `getWebhookInfo`, and confirm the deployed domain is HTTPS. |
| Answers say evidence is insufficient | This is intentional when retained messages do not directly answer the question. |
| Cleanup does not run | Verify `CRON_SECRET` matches on the scheduler and web service, then manually call the retention endpoint. |

## Verification

```bash
pnpm check
pnpm test
pnpm build
```

## References

[1] [Vercel: securing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)  
[2] [Vercel: cron jobs](https://vercel.com/docs/cron-jobs)  
[3] [Render: cron jobs](https://render.com/docs/cronjobs)  
[4] [Telegram Bot API](https://core.telegram.org/bots/api)  
[5] [Google Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings)  
[6] [Telegram: Log In With Telegram](https://core.telegram.org/bots/telegram-login)
