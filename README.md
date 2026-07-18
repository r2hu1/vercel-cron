# Vercel Cron Proxy

Next.js project that generates Vercel Cron Jobs from a `.env` config. Each URL in `CRON_URLS` becomes a cron entry in `vercel.json`. On trigger, a Next.js route handler proxies the request to the target URL.

## Setup

```bash
npm install
```

## Configure

Edit `.env`:

```env
CRON_URLS=https://api.example.com/health,https://api.example.com/sync
SCHEDULE=0 */6 * * *,0 0 * * *
```

- `CRON_URLS` — comma-separated URLs to call on schedule
- `SCHEDULE` — comma-separated cron expressions (1:1 with URLs). Missing entries use `0 */6 * * *`

## Build

```bash
npm run build
```

Reads `.env`, validates URLs and cron expressions, generates `vercel.json` with cron entries.

## Deploy

1. Push to GitHub and import into Vercel
2. Set these env vars in Vercel project settings:
   - `CRON_URLS` — same as in `.env` (runtime)
   - `CRON_SECRET` — optional, random string for auth verification
3. Deploy. Cron jobs run on the configured schedule.

## Local dev

```bash
npm run dev
```

Cron jobs only trigger in production, but you can manually test:

```bash
curl http://localhost:3000/api/cron/0
```

## How it works

| Step | Description |
|---|---|
| `.env` | Stores `CRON_URLS` and `SCHEDULE` |
| `npm run build:vercel` | Generates `vercel.json` with `crons[]` |
| Vercel deploy | Reads `vercel.json`, schedules cron jobs |
| Cron trigger | Vercel GETs `/api/cron/{i}` on schedule |
| Route handler | Fetches target URL with timeout (25s), retries (2x), auth check |

## Route handler features

- Request ID per invocation for log tracing
- Auth via `CRON_SECRET` env var (Authorization header)
- Fetch timeout (25s) via AbortController
- Retry on transient errors (ECONNRESET, timeout) with backoff
- Non-transient errors (4xx, 5xx) fail immediately, no retry
- Structured JSON logging (visible in Vercel logs)
- Response body truncated at 2000 chars

## Generated `vercel.json` example

```json
{
  "crons": [
    { "path": "/api/cron/0", "schedule": "0 */6 * * *" },
    { "path": "/api/cron/1", "schedule": "0 0 * * *" }
  ]
}
```
