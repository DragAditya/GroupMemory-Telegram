# Production Go-Live Checklist

Complete every item before adding GroupMemory to a production Telegram group.

## Database and secrets

- [ ] Create a TiDB/MySQL-compatible production database with TLS enabled.
- [ ] Run `pnpm drizzle-kit generate` and `pnpm drizzle-kit migrate` against the production database.
- [ ] Set every required secret listed in [the environment variable reference](environment-template.md).
- [ ] Use long random values for `JWT_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, and `CRON_SECRET`.
- [ ] Confirm `OWNER_OPEN_ID` belongs to the Manus account that should have dashboard access.

## Web service

- [ ] Deploy the web service to an HTTPS production URL.
- [ ] Confirm `GET https://YOUR-DOMAIN/api/health` returns `{"ok":true,"service":"groupmemory"}`.
- [ ] Open the dashboard, sign in as the configured owner, and confirm bot identity, webhook state, and group cards load.
- [ ] Confirm a different signed-in admin cannot open the dashboard.

## Telegram

- [ ] In BotFather, turn **Group Privacy** off for the bot.
- [ ] Register `https://YOUR-DOMAIN/api/telegram/webhook` with `setWebhook` and `TELEGRAM_WEBHOOK_SECRET`.
- [ ] Run `getWebhookInfo` and confirm the URL is correct with no growing pending-update count.
- [ ] Use the dashboard’s **Add bot to a group** action.
- [ ] Make the bot a group admin and send `/memory on` in the target group.
- [ ] Send a test message, then test `/search` and `/ask` from the group.

## Retention automation

- [ ] Configure hourly cleanup using Vercel Cron, Render Cron, or another scheduler.
- [ ] Confirm the scheduler sends `Authorization: Bearer <CRON_SECRET>`.
- [ ] Trigger one manual cleanup run and confirm the JSON response returns `ok: true`.
- [ ] Check the owner dashboard to confirm the cleanup job shows a recent run.

## Ongoing operations

- [ ] Monitor Telegram’s webhook status and the dashboard delivery note after each deployment.
- [ ] Rotate Telegram, Gemini, and scheduler secrets immediately if they are exposed.
- [ ] Keep database backups and retention settings aligned with the group’s privacy policy.
