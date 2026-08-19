# Environment Variable Reference

Copy these names and placeholder values into your hosting provider’s secret manager or a local uncommitted `.env` file. Do **not** commit an `.env` file to GitHub.

```dotenv
NODE_ENV=production
PORT=3000

DATABASE_URL=mysql://USER:PASSWORD@HOST:4000/groupmemory?ssl={"rejectUnauthorized":true}

JWT_SECRET=replace-with-a-random-32-plus-character-secret
VITE_APP_ID=your-manus-oauth-app-id
VITE_OAUTH_PORTAL_URL=https://manus.im
OAUTH_SERVER_URL=https://api.manus.im
OWNER_OPEN_ID=your-manus-account-open-id

TELEGRAM_BOT_TOKEN=123456:replace-with-your-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=replace-with-a-random-webhook-secret

GEMINI_API_KEY=replace-with-your-google-ai-studio-api-key
GEMINI_GENERATION_MODEL=gemini-2.5-flash

CRON_SECRET=replace-with-a-random-16-plus-character-cron-secret
RETENTION_CRON_URL=https://your-public-domain.example/api/scheduled/groupmemory-retention
```

| Variable | Required by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | All hosts | Use a TiDB/MySQL connection with TLS in production. |
| `JWT_SECRET` | All hosts | Used for dashboard session signing. |
| OAuth variables | All hosts with the dashboard | The project owner must match `OWNER_OPEN_ID`. |
| Telegram variables | All hosts | Keep the bot token and webhook secret private. |
| Gemini variables | All hosts | The embedding model is fixed to `gemini-embedding-2`; select an available generation model. |
| `CRON_SECRET` | Vercel, Render, other external hosts | Must match on the scheduler and the web service. |
| `RETENTION_CRON_URL` | Render cron service | Full public URL for the cleanup endpoint. |
