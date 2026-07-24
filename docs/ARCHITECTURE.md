# Architecture & design rationale

This document explains *why* the system is built the way it is. It follows the
PRD's own logic: every decision is downstream of the three brand-science
principles in §1 (the 95-5 rule, distinctiveness over volume, credibility from
owned substance).

## 1. Build only the intelligence; buy the plumbing (§8)

Two layers:

- **Built** (the parts you can't buy): owned-material ingestion + repurposing,
  the brand-safety gate, trend/competitor monitoring that surfaces to a human,
  and the monthly editorial memo. These are `src/rag`, `src/agents`, and
  `src/workflows`.
- **Bought** (don't rebuild a scheduler): publishing, scheduling, native
  analytics → **Buffer** or **Ayrshare**, behind one `Publisher` interface
  (`src/publish`). The workflows never touch a platform API directly.

## 2. Everything degrades to a mock

Each external dependency has a real implementation *and* a deterministic offline
one, selected by whether credentials are present:

| Dependency | Live | Offline default |
|---|---|---|
| LLM | Anthropic (`src/llm/anthropic.ts`) | `MockLLM` (deterministic) |
| Embeddings | OpenAI/Voyage HTTP | `MockEmbedder` (hashed bag-of-words, deterministic) |
| Publishing | Buffer / Ayrshare | `MockPublisher` |
| Telegram | Bot API | dry-run (logs) |
| Postgres | required for DB workflows | pure-logic paths + unit tests run without it |

This is not just for tests. It means the whole pipeline is demonstrable and the
§7 quality instrumentation works before a single credential is provisioned — and
it keeps CI free and hermetic.

## 3. The two intake paths converge on one gate (§4.1, §4.2, §9)

The morning pitch (AI-seeded, WF-1/2) and manual intake (human-seeded, WF-3)
both produce a `topics` row and both run the identical WF-4 → WF-5 path. There is
**no fast lane** that skips review — the quality/brand bar is the same. Manual
topics simply carry a higher `priority` so they outrank AI suggestions in the
queue, because your sharpest posts usually come from something you just saw.

"Skip both" is first-class: the target is 2–4 posts a week, not one a day.
Skipping costs nothing and feeds the editorial memo.

## 4. Credibility guard: `low_source` (§4.2, §18.5)

Retrieval enforces a cosine-similarity threshold. If nothing clears it, the draft
is flagged `low_source` and the operator is told "no strong source asset — draft
will be lighter on proof" rather than the system silently inventing claims. This
directly protects the thing the whole strategy depends on: not shipping a bad
post in front of a credible audience.

## 5. The brand-safety reviewer is a hard gate (§10)

A brand-visibility play can be *killed*, not slowly eroded, by one bad post. So
`src/agents/reviewer.ts` runs on the strong model tier and blocks on any failure
(hallucinated claims, banned topics, unsigned client names, voice/quality, the
"IIT dean" litmus test). Flagged drafts loop back for a rewrite up to N times,
then escalate to the human *with the flag reason attached* — never silently
dropped. An offline heuristic gate (`heuristicReview`) enforces a floor even
without an LLM.

## 6. Model routing is the main cost lever (§20)

`src/llm/router.ts` routes by task, not one model for everything:

- **fast tier** — daily pitch, ideation, first drafts (high volume, low stakes,
  edited by a human anyway).
- **strong tier** — final polish, the brand-safety reviewer, the editorial memo
  (quality and safety are won here; worth the spend).

Cost tagging (`drafts.model_used`, `assets.cost_usd`) makes cost-per-published-post
measurable from day one.

## 7. Honest measurement (§3, §11)

Brand is a long game and does not attribute cleanly. The schema tracks directional
proxies — SOV snapshots (`sov_snapshots`), engagement timeseries (`metrics`), and
the §7 operational metric (first-pass approval rate + edit distance, computed in
`approvals.qualityStats`). It deliberately does **not** chase follower count or raw
engagement rate. The single most valuable signal — reuse by BD/sales in pitches —
is qualitative and tracked by the human, not the machine.

## 8. Data model choices (§15)

- **pgvector in the same Postgres** — at MVP scale (a handful of posts/week, a
  modest owned-material corpus) a separate vector store is overkill. Retrieval
  lives next to the relational data; one database to operate.
- **Enums for status** — `topic_status`, `draft_status`, `topic_source` keep state
  handling explicit and catch bad transitions at the type level.
- **Audit trail** — every publish decision is an `approvals` row; every published
  post an immutable `posts` row. This is the §10 requirement, not optional.

## 9. What is intentionally *not* here (§6)

Dropped from v0.1 as over-built for a brand-visibility objective: the 11-agent
roster, three simultaneous platforms, a day-one custom frontend, real-time
analytics, and an ML-style learning loop. The trimmed roster is five agents; the
"frontend" is a shared board + a webhook; learning is a human-read monthly memo.
X/Instagram, carousels/video, and a custom UI are V2 — the platform enum and
`channel_configs` table are already multi-platform-ready for when that day comes.
```
