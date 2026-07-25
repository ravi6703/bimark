# Deploying to Vercel

**Live deployment:** https://bimark-zeta.vercel.app (mock mode — no `DATABASE_URL`
set yet; see steps 2–3 below to wire the real Supabase DB and go live).

The PRD's design (§8: buy the plumbing, build only the intelligence) is
implemented as a long-running Node service by default — `src/index.ts` runs an
Express server plus a `node-cron` scheduler, which is what `docker-compose.yml`
runs. **Vercel Functions are stateless and don't keep timers alive**, so the
scheduled workflows (WF-1, WF-6, WF-7) can't run as `node-cron` jobs there.
This directory adapts the same business logic (unchanged, in `src/`) to run on
Vercel instead:

- **HTTP surface** → individual serverless functions under `api/*.ts`
  (mirrors the Express routes in `src/server.ts` 1:1).
- **Scheduler** → [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
  configured in `vercel.json`, each hitting a protected `/api/cron/*` endpoint.
- **Database** → an external Postgres with the `pgvector` extension. Vercel
  doesn't provide this itself; this deployment uses your **Supabase** project
  (Supabase ships pgvector as a first-class extension).

Both deployment targets read the same `src/` code and the same env vars — pick
whichever fits how you want to run this. Nothing about the Docker/VM path
changed.

## 1. Apply the schema to Supabase

Open your Supabase project → **SQL Editor** → New query → paste the contents
of [`docs/supabase-migration.sql`](supabase-migration.sql) (the combined
`db/migrations/001_init.sql` + `002_indexes.sql`) → **Run**. It's idempotent
(every statement is `IF NOT EXISTS`), so re-running it is harmless.

This creates the `vector` extension and every table in §15 — no seed data yet.

## 2. Seed Board Infinity (brand, pillars, sample owned material)

The seed also computes embeddings for the sample owned material, so it's
easiest to run from a machine with `DATABASE_URL` pointed at Supabase, not by
hand-writing SQL:

```bash
export DATABASE_URL="postgresql://postgres:<your-real-password>@db.<project-ref>.supabase.co:5432/postgres"
npm run seed
```

Use the **connection pooler** string (port `6543`, add `?pgbouncer=true`) for
anything that will run as a Vercel Function later — direct connections (port
`5432`) exhaust quickly under serverless concurrency. Supabase shows both
forms under Project Settings → Database → Connection string.

## 3. Set environment variables on the Vercel project

Project Settings → Environment Variables. At minimum:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **pooled** connection string (port 6543, `?pgbouncer=true`) |
| `CRON_SECRET` | any random string — Vercel sends it as `Authorization: Bearer <value>` on cron calls; the `/api/cron/*` functions reject anything else (see `api/_lib/cronAuth.ts`) |

Add these to actually go live (all optional — omitted ones keep their mock/dry-run behavior):

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | real Claude generations instead of `MockLLM` |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | real approval-gate messages instead of dry-run logs |
| `PUBLISH_PROVIDER` (+ `BUFFER_*` or `AYRSHARE_API_KEY`) | real publishing instead of `MockPublisher` |
| `EMBED_PROVIDER` (+ `EMBED_API_KEY`) | real embeddings instead of the deterministic mock |

## 4. Point Telegram's webhook at the deployment (once you have a real bot)

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-deployment>.vercel.app/api/webhooks/telegram"
```

And point your Airtable/Notion board's automation at
`https://<your-deployment>.vercel.app/api/webhooks/manual-intake` (§4.2).

## 5. Cron cadence & the Hobby-plan caveat

`vercel.json` schedules (UTC, matching the PRD defaults converted from IST):

| Workflow | Schedule | PRD cadence |
|---|---|---|
| WF-1 morning pitch | `30 2 * * *` | daily 08:00 IST |
| WF-6 analytics poll | `*/30 * * * *` | every 30 min (§7.1) |
| WF-7a SOV snapshot | `30 3 * * 1` | weekly, Monday |
| WF-7b editorial memo | `30 3 1 * *` | monthly, 1st |

**Vercel's Hobby (free) plan limits cron jobs to once per day.** The 30-minute
analytics poller needs a **Pro** plan or higher to run at its configured
cadence — on Hobby it will be silently throttled to a daily run. Everything
else (daily/weekly/monthly) works on Hobby as-is.

## 6. What doesn't run on Vercel

- **`npm run ingest`** (owned-material ingestion from a local directory, §18)
  is a CLI tool, not a cron job — there's no persistent filesystem to point it
  at on Vercel. Run it locally against the same `DATABASE_URL`, or wire the
  Drive/Notion connectors (§18.1) into a scheduled function if you want
  ingestion refreshes to run without a local step.
- The `Trend/Competitor Monitor` (`src/agents/trendMonitor.ts`) still defaults
  to a no-op `NullTrendSource` regardless of deployment target — wire a real
  listening source the same way on either path.

## Redeploying

This deployment was created directly from the built `src/`/`api/` tree (not
git-linked). To pick up future changes: either re-run the same deploy step, or
link the Vercel project to the `ravi6703/bimark` GitHub repo in the Vercel
dashboard (Project Settings → Git) for automatic deploys on push to
`claude/system-creation-7oxaj4` / `main`.
