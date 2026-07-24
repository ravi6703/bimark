import { config } from "../config.js";
import { logger } from "../logger.js";
import { DEFAULT_VOICE_GUIDE } from "../agents/prompts.js";
import { brands, channels, pillars } from "./repositories/index.js";
import { ingestDocument, type SourceDocument } from "../rag/ingest.js";
import { closePool } from "./pool.js";
import { migrate } from "./migrate.js";

/**
 * Seed the MVP with Board Infinity: brand + voice guide, a proposed starting set
 * of pillars (§12.1), one LinkedIn channel config, and sample owned material so
 * the pipeline has something real to repurpose. Idempotent — safe to re-run.
 *
 * The sample material below is illustrative placeholder content for local dev;
 * replace it with real ingested research/decks (§18) before shipping.
 */

const PILLARS = [
  {
    name: "Skills-based hiring",
    description: "The shift from degrees to demonstrated skills, and what it means for hiring.",
  },
  {
    name: "Employability outcomes",
    description: "Turning learning into measurable job outcomes for graduates and professionals.",
  },
  {
    name: "Industry-academia collaboration",
    description: "How universities and employers co-design curricula that actually land jobs.",
  },
  {
    name: "Applied assessment",
    description: "Assessment and learning science that predicts on-the-job performance.",
  },
];

const SAMPLE_MATERIAL: { pillar: string; title: string; text: string }[] = [
  {
    pillar: "Skills-based hiring",
    title: "Sample research briefing — skills-based hiring",
    text: `Skills-based hiring briefing (illustrative sample).

Employers increasingly screen for demonstrated skills over degree pedigree. In our
programme cohorts, structured skill assessments predicted early job performance
better than prior academic marks alone. The practical implication: hiring funnels
that add a short, role-relevant skills task surface strong candidates that a
resume screen would have filtered out.

Three moves that worked: (1) define the 4-5 skills the role actually needs; (2)
assess them with a realistic task, not a quiz; (3) give candidates feedback so the
assessment itself builds goodwill. The point is not to replace judgement but to
make it evidence-led.`,
  },
  {
    pillar: "Employability outcomes",
    title: "Sample case study — employability outcomes",
    text: `Employability outcomes case study (illustrative sample).

A cohort-based upskilling track paired structured curriculum with mentor review
and placement support. The learners who completed the applied projects — not just
the lectures — were markedly more likely to convert interviews to offers. The
lesson for anyone designing employability programmes: completion of *applied*
work, with feedback, is the outcome that matters, and it is the thing to
instrument from day one.

What did not move the needle: content volume. More videos did not help. Fewer,
harder, reviewed projects did.`,
  },
  {
    pillar: "Industry-academia collaboration",
    title: "Sample note — industry-academia collaboration",
    text: `Industry-academia collaboration note (illustrative sample).

The gap between what campuses teach and what employers need is real, but it closes
fastest when the two co-design a small number of capstone projects rather than
rewriting whole syllabi. In pilots, an employer-set capstone reviewed by
practitioners gave students a portfolio artifact and gave the employer an early
read on talent — a two-sided win that a job fair cannot match.

The operating model that scales: a shared rubric, a practitioner reviewer, and one
capstone per term. Start narrow.`,
  },
  {
    pillar: "Applied assessment",
    title: "Sample briefing — applied assessment",
    text: `Applied assessment briefing (illustrative sample).

Multiple-choice assessment is cheap to grade and weak at predicting real
performance. Task-based assessment — build this, debug that, present the trade-off
— correlates better with how people actually work, at the cost of more grading
effort. Rubric design is where the credibility lives: a vague rubric produces
noisy grades and erodes trust in the score.

For programmes serious about outcomes, the investment is in the rubric and reviewer
calibration, not in more questions.`,
  },
];

export async function seed(): Promise<void> {
  if (!config.db.enabled) throw new Error("DATABASE_URL not set — cannot seed.");
  await migrate();

  let brand = await brands.getByName("Board Infinity");
  if (!brand) {
    brand = await brands.create({
      name: "Board Infinity",
      voice_guide: DEFAULT_VOICE_GUIDE,
      visual_notes: "Consistent template + signature POV voice (§4 distinctive assets).",
      banned_topics: ["politics", "competitor bashing", "unverifiable claims"],
    });
    logger.info({ brandId: brand.id }, "seed: created brand");
  }

  const existing = await pillars.listActive(brand.id);
  if (existing.length === 0) {
    for (const p of PILLARS) await pillars.create({ brand_id: brand.id, ...p });
    logger.info({ count: PILLARS.length }, "seed: created pillars");
  }

  const channelList = await channels.list(brand.id);
  if (channelList.length === 0) {
    await channels.create({
      brand_id: brand.id,
      platform: "linkedin",
      weekly_target: 3,
      allowed_media: ["text", "image"],
      monthly_budget_usd: 100,
    });
    logger.info("seed: created LinkedIn channel config");
  }

  for (const m of SAMPLE_MATERIAL) {
    const doc: SourceDocument = {
      sourceType: "manual",
      sourceRef: `seed:${m.title}`,
      title: m.title,
      text: m.text,
      pillarHint: m.pillar,
    };
    const r = await ingestDocument(brand.id, doc);
    logger.info({ title: m.title, chunks: r.chunks, skipped: r.skipped }, "seed: ingested sample");
  }

  logger.info({ brandId: brand.id }, "seed complete");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "seed failed");
      process.exit(1);
    });
}
