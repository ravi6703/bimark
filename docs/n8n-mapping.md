# n8n ↔ code mapping

The PRD (§16) specifies seven n8n workflows. This service implements each as a
code module with the same responsibilities and hand-offs (Postgres rows +
webhooks). If you later prefer to run this in n8n, each module is a faithful
blueprint: the n8n node sequence maps directly onto the functions below.

| PRD workflow | Trigger | Code | Notes |
|---|---|---|---|
| **WF-1 · Morning Pitch** | Cron 08:00 IST | `src/workflows/wf1_morningPitch.ts` → `runMorningPitch()` | Reads pillars + `channel_configs`, pulls a spread of `owned_assets` (recent + not-recently-used), calls the Daily Pitch agent, inserts two `topics` (`suggested`), sends the `[A][B][🔄][⏭]` Telegram message. |
| **WF-2 · Pitch Callback** | Telegram webhook | `src/workflows/wf2_pitchCallback.ts` → `handlePitchCallback()` | Switch on callback: pick → set `picked`/`skipped` + run WF-4; `two_more` → re-run WF-1; `skip` → mark both `skipped` (feeds the memo). |
| **WF-3 · Manual Intake** | Webhook (board/form) | `src/workflows/wf3_manualIntake.ts` → `handleManualIntake()` | Normalises input (zod), inserts `topics` (`source=manual`, priority 10), runs WF-4. Same gate — no fast lane. |
| **WF-4 · Repurpose & Review → Draft** | Called by WF-2/WF-3 | `src/workflows/wf4_repurposeReview.ts` → `runRepurposeReview()` | Retrieve (or use the chosen asset) → Repurposing agent → Brand-Safety reviewer → loop on flag up to N, else escalate → persist `drafts` (`pending_approval`) → Telegram preview. |
| **WF-5 · Approval Callback** | Telegram webhook | `src/workflows/wf5_approvalCallback.ts` → `finalizeDraft()` | approve/edit/reject → log `approvals` (+ `edit_distance`, §7) → publish via Buffer/Ayrshare → write `posts` with a `poll_until` window. |
| **WF-6 · Analytics Poller** | Cron every 30m | `src/workflows/wf6_analyticsPoller.ts` → `runAnalyticsPoller()` | Selects posts inside their polling window, fetches metrics, tapers by post age, inserts `metrics`. |
| **WF-7 · SOV + Editorial Memo** | Cron weekly/monthly | `src/workflows/wf7_sovMemo.ts` → `runSovSnapshot()` / `runEditorialMemo()` | Weekly SOV → `sov_snapshots`; monthly memo summarises landed/skipped/SOV → `insights` → Telegram. |

## Node-type correspondence

| n8n node | Code equivalent |
|---|---|
| **Cron** | `node-cron` schedules in `src/scheduler.ts` |
| **Postgres** / **Postgres (vector)** | `src/db/repositories/*` and `src/rag/retrieve.ts` |
| **AI Agent (LLM)** | `src/agents/*` over `src/llm` (Anthropic or mock), routed by `src/llm/router.ts` (§20) |
| **Telegram** / **Telegram Trigger** | `src/telegram/client.ts` + `src/server.ts` webhook |
| **HTTP Request** (publish/metrics) | `src/publish/*` (Buffer/Ayrshare) |
| **Webhook** | Express routes in `src/server.ts` |
| **Switch** / **IF** | Plain control flow in the workflow modules |
| **Function** (normalise, taper) | `src/workflows/wf3_manualIntake.ts` (normalise), `wf6_analyticsPoller.ts#shouldPoll` (taper) |

## The intake board (§4.2)

In the MVP the "frontend" is a shared Airtable/Notion board: a row = a topic +
optional fields, and saving it fires the WF-3 webhook. Point the board's
automation at `POST /webhooks/manual-intake` with the JSON shape validated by
`manualIntakeSchema`. A dedicated custom UI is intentionally deferred (§6 V2).
