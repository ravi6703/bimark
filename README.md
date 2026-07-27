# Brand Visibility Engine — "Board Infinity Presence"

An implementation of **PRD v0.2**: a *memory-and-credibility machine* that
repurposes Board Infinity's **owned material** (research, courses, case studies,
faculty insight) into a distinctive, on-brand social presence — with a human as
**editor-in-chief**. It is deliberately **not** a lead-gen machine, not a content
firehose, and not a sales channel (see PRD §1–§3).

> The PRD specifies an **n8n** orchestration. This repo implements the *exact same
> design* (§15 schema, §16's seven workflows, §17 agent prompts, §18 RAG, §19 SOV,
> §20 model routing) as a **testable TypeScript service**. n8n JSON is hard to
> version, review, and test; code is not. Each module maps 1:1 to an n8n workflow
> — see [`docs/n8n-mapping.md`](docs/n8n-mapping.md).

## What it does

```
                     ┌─────────────── owned material (Drive/Notion/decks) ───────────────┐
                     │  ingest → chunk → embed → pgvector (RAG, §18)                      │
                     └───────────────────────────────┬───────────────────────────────────┘
  TWO INTAKE PATHS                                    │
  ☀️ Daily pitch (WF-1)  →  Telegram [A][B][🔄][⏭]     │   n8n intelligence layer
     pick A/B (WF-2) ─────────────┐                   ├─ Repurposing agent (§17.3)
  ✍️ Manual topic (WF-3, priority) ┼──▶ Repurpose+Review (WF-4) ─┬─ Brand-Safety reviewer (§17.4, hard gate)
                                   │                              └─ low_source credibility guard (§4.2)
                                   ▼
     Telegram: ✅ approve / ✏️ edit / ❌ reject (WF-5)   ← same gate for BOTH paths (§9)
                                   │ on approve
                                   ▼
              Buffer / Ayrshare  ──▶  LinkedIn        (buy the plumbing, §8)
                                   │
                                   ▼
        analytics poll (WF-6) → SOV + monthly editorial memo (WF-7, §19)
```

Everything runs **offline with zero spend** by default: no `ANTHROPIC_API_KEY`
→ a deterministic `MockLLM`; no publisher creds → a `MockPublisher`; no Telegram
token → messages are logged (dry-run). Add credentials to light up each real
integration. This is what makes the §7 quality bar measurable from day one.

## Deployment targets

The same `src/` business logic runs two ways:

- **Docker/VM** (`docker-compose.yml`) — a long-running Express server +
  `node-cron` scheduler. This is the default and matches the PRD's "always-on
  service" shape most closely.
- **Vercel** (`api/*.ts` + `vercel.json`) — the HTTP routes as individual
  serverless functions, with the scheduled workflows (WF-1/6/7) run by Vercel
  Cron Jobs instead of `node-cron`, against an external Postgres+pgvector
  (e.g. Supabase). See [`docs/VERCEL.md`](docs/VERCEL.md) for the full setup —
  applying the schema, env vars, and the Hobby-plan cron-frequency caveat.

## Quick start

```bash
npm install
cp .env.example .env            # works as-is (all mocks); add keys to go live

# With Docker (Postgres + pgvector + app):
docker compose up               # migrates, seeds, serves on :3000

# …or locally against your own Postgres (needs the pgvector extension):
export DATABASE_URL=postgres://bimark:bimark@localhost:5432/bimark
npm run migrate                 # apply §15 schema
npm run seed                    # Board Infinity brand, pillars, sample owned material
npm start                       # HTTP server + cron scheduler
```

Try the pipeline without waiting for 8am:

```bash
npm run pitch                   # trigger WF-1 morning pitch now (logs the Telegram message)
npm run ingest -- ./my-material # ingest .txt/.md owned material (§18)

# Manual intake (WF-3) via the webhook:
curl -X POST localhost:3000/webhooks/manual-intake \
  -H 'content-type: application/json' \
  -d '{"brand_id":1,"topic":"the skills gap in tier-2 engineering colleges","pillar":"Skills-based hiring"}'

curl localhost:3000/metrics/quality   # §7 first-pass approval rate + edit distance
```

## Testing

```bash
npm test          # 37 offline unit tests (no DB, no network)
DATABASE_URL=... npm test   # + 10 full-stack integration tests against real pgvector
```

The offline suite covers the pure logic (edit distance, chunking, embeddings,
model routing) and the agents (with an injected mock LLM). The integration suite
exercises **every workflow end to end** — pitch → pick → draft → review →
approve-with-edits → publish → poll → SOV → memo.

## Configuration

All via `.env` (see [`.env.example`](.env.example) for the annotated list). The
important switches:

| Variable | Effect |
|---|---|
| `DATABASE_URL` | Postgres + pgvector. Unset ⇒ scheduler off, HTTP/health only. |
| `ANTHROPIC_API_KEY` | Unset ⇒ deterministic `MockLLM`. Set ⇒ real Claude, routed per §20. |
| `LLM_MODEL_FAST` / `LLM_MODEL_STRONG` | The two tiers (§20). Pitch/draft → fast; polish/review/memo → strong. |
| `EMBED_PROVIDER` | `mock` (offline, deterministic) \| `openai` \| `voyage`. |
| `PUBLISH_PROVIDER` | `mock` \| `buffer` \| `ayrshare` (§8). |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | The approval gate (§9). Unset ⇒ dry-run logs. |
| `RAG_SIMILARITY_THRESHOLD` | Below this, drafts are flagged `low_source` instead of inventing claims (§4.2). |

## What "working" means

The product measures the thing it is judged on, not just the thing it produces.
Four numbers, on the **Results** screen:

| Number | How it's derived |
| --- | --- |
| Posts published vs. weekly target | Measured, per channel |
| First-pass approval rate + median time to decision | Measured, from the approvals log |
| Hours saved | Real published count × the team's **own** before/after estimate |
| Leads & signups | Recorded by a human, shown next to how much of what published is attributable at all |

Two deliberate constraints keep it honest:

- **Nothing is estimated on the platform's behalf.** A number that isn't set up
  reports `not configured` with the reason, never a plausible-looking zero.
  Rates stay blank on an empty sample rather than reporting 0%.
- **Attribution is only claimed where it exists.** Publishing UTM-stamps links
  to the brand's *own* domain only; a third-party URL the reviewer approved is
  never rewritten, and a post with no stampable link records no campaign rather
  than counting as a zero-lead post.

### On edit distance

A large human edit is not an AI failure. LinkedIn demotes content it detects as
AI-generated, so the reviewer's edit is what makes a post work — the surfaces
that show this metric say so, and the LinkedIn prompt deliberately produces a
strong draft that wants a human line rather than a finished post.

### Pillar intent

Generation optimises for credibility over lead-gen. That's right for most
pillars and wrong for the ones that exist to convert, so each pillar carries an
intent: `authority` (the default, no call to action, byte-identical to the
original behaviour) or `conversion` (exactly one plain next step, at the end).

## Open decisions from the PRD (§12)

The PRD leaves five decisions open; the seeded defaults here are **proposals**,
easy to change:

1. **Pillars** — seeded with four: *Skills-based hiring*, *Employability
   outcomes*, *Industry-academia collaboration*, *Applied assessment*. Edit in
   `src/db/seed.ts` or the `pillars` table.
2. **Owned-material access** — MVP loads `.txt`/`.md` from a directory; the
   Drive/Notion/pptx/pdf extractors plug into `src/rag/ingest.ts`.
3. **Buffer vs. Ayrshare** — both adapters exist; pick via `PUBLISH_PROVIDER`.
4. **Distinctive formats** — `topics.format_hint` + the repurposing prompt carry
   the recurring format; commit to 1–2 named series (strongly recommended).
5. **Editor-in-chief** — whoever holds the Telegram approval chat.

## Layout

```
db/migrations/       §15 schema (pgvector) + indexes
src/config.ts        typed env; every integration degrades to a mock
src/llm/             LLM interface, Anthropic + mock providers, §20 routing
src/rag/             chunk, embed (mock/openai/voyage), ingest (hash-skip), retrieve (threshold)
src/agents/          §17 prompts + Daily Pitch, Repurposing, Reviewer, Trend Monitor, Memo
src/telegram/        approval-gate client + message/callback encoding
src/publish/         Buffer / Ayrshare / mock adapters (§8)
src/workflows/       WF-1 … WF-10 (§16)
src/platforms/       the channel registry — one place a platform is defined
src/scoreboard/      the four numbers the product is judged on (Move 2)
src/eval/            prompt-quality report + golden-set replay harness (Move 5)
src/brand/           per-brand readiness — is this brand set up to draft? (Move 6)
src/server.ts        Express app (Docker/VM): manual-intake + telegram webhooks, /health, /metrics/quality
src/scheduler.ts     node-cron for WF-1/6/7 + nightly ingest refresh (Docker/VM only)
api/                 Vercel serverless functions — same routes/cron jobs, see docs/VERCEL.md
test/                offline unit tests + DB-gated integration test
docs/                ARCHITECTURE.md, n8n-mapping.md, VERCEL.md, supabase-migration.sql
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the design rationale,
[`docs/n8n-mapping.md`](docs/n8n-mapping.md) for the module ↔ n8n-workflow map,
and [`docs/VERCEL.md`](docs/VERCEL.md) for the serverless deployment path.
