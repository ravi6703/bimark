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

/**
 * Multi-brand support — Board Infinity operates several distinct brand lines,
 * each with its own audience and go-to-market, not just one voice with
 * different logos. Grounded in the brands' own pitch decks (not invented):
 * Leadup Universe's enterprise-capability deck, InfyLearn's product deck, and
 * the "Digital Course Production Services" deck (a Board Infinity-branded
 * service line, seeded here as "Elearning Solutions" since it has its own
 * distinct audience/positioning from Board Infinity's own hiring-readiness
 * business). Each gets its own pillars, voice, and competitor set — starting
 * points to confirm/edit with the team, same posture as Board Infinity's own
 * seed data.
 */
interface BrandSeed {
  name: string;
  slug: string;
  voiceGuide: string;
  visualNotes: string;
  bannedTopics: string[];
  defaultCompetitors: string[];
  pillars: { name: string; description: string }[];
}

const BRAND_SEEDS: BrandSeed[] = [
  {
    name: "Leadup Universe",
    slug: "leadup-universe",
    voiceGuide: `LEADUP UNIVERSE — BRAND VOICE  [confirm/edit with the team]
Audience: CXOs, CHROs, and L&D heads at Fortune 1000 / large enterprises,
  evaluating capability-building partners — not a training buyer, an
  execution-outcomes buyer.
Personality: authoritative, systems-minded, allergic to "training" framing.
  The core distinction to always draw: "We don't deliver training. We build
  execution capability." Business-first, role-based, application-driven,
  outcomes-measured — never activity-measured.
Do: frame around the ALIGN -> DEPLOY -> REINFORCE -> MEASURE model; name a
  specific business/execution problem (AI adoption without workforce
  readiness, strategy that doesn't translate into outcomes); cite concrete
  proof points from real engagements (500K+ professionals, F1000 trust,
  academic partners like IIMs/XLRI/Thunderbird) rather than generic claims.
Don't: use "course," "program," or "training" as the hero word — reframe to
  "capability architecture" / "execution systems"; don't quote activity
  metrics (seat-time, completion %) as if they were the point.
Litmus test: would a CHRO read this and think "this firm gets that my
  problem is execution, not content"? If not, it doesn't ship.`,
    visualNotes: "Enterprise/executive register — dark, systems-diagram visuals over lifestyle photography.",
    bannedTopics: ["politics", "competitor bashing", "unverifiable ROI claims", "naming enterprise clients without sign-off"],
    defaultCompetitors: ["BTS Group", "Korn Ferry", "DDI", "Emeritus", "Harappa Education"],
    pillars: [
      { name: "Capability architecture, not training", description: "The core differentiator: execution systems vs. generic learning content or advisory-only engagements." },
      { name: "AI-readiness & workforce enablement", description: "Closing the gap between AI adoption and the workforce's actual readiness to use it." },
      { name: "Role-based capability design", description: "Business-first, role-specific capability building instead of one-size-fits-all programs." },
      { name: "Manager-led reinforcement & behavior change", description: "Continuous nudges and manager-led reinforcement that make new capability stick in day-to-day work." },
      { name: "Business-linked measurement", description: "Capability diagnostics and impact measurement tied to real business KPIs, not completion rates." },
    ],
  },
  {
    name: "InfyLearn",
    slug: "infylearn",
    voiceGuide: `INFYLEARN — BRAND VOICE  [confirm/edit with the team]
Audience: higher-education L&D/placement leaders, ed-tech partners, and
  corporate L&D buyers evaluating InfyLearn's product stack (Infy LMS, Infy
  Recruit, Infy Assess, Infy Resume Copilot, Infy AI Interview).
Personality: practical, product-led, metrics-forward — "Asia's leading
  career-first L&D ecosystem for higher education." Distinct from Board
  Infinity's own hiring-readiness identity: InfyLearn IS the technology stack
  institutions run on, not a consulting relationship.
Do: name the specific product doing the work (e.g. "Infy Recruit automates
  campus placements end to end"); cite real, specific metrics from actual
  deployments (40% faster hiring cycles, 500K+ professionals impacted, 200+
  institution partnerships) rather than vague claims; speak to a named
  university function (Admissions, Learning Delivery, Career Services).
Don't: blur into generic "we help you learn better" ed-tech marketing —
  always ground in a named product and a named function it serves.
Litmus test: could a university's placement head point at this post and say
  "yes, that's the exact problem Infy Recruit solves for us"? If not, it's
  too generic to ship.`,
    visualNotes: "Product-screenshot-led — dashboards, in-product UI, real workflow states over stock photography.",
    bannedTopics: ["politics", "competitor bashing", "unverifiable claims", "naming partner institutions without sign-off"],
    defaultCompetitors: ["Superset", "Unstop", "HackerEarth", "TalentLMS", "Skill-Lync"],
    pillars: [
      { name: "Campus placement automation", description: "Infy Recruit — streamlining the entire campus recruitment and placement process." },
      { name: "AI-powered career prep", description: "Infy Resume Copilot and Infy AI Interview — AI-driven resume building and mock-interview preparation." },
      { name: "Learning management & course delivery tech", description: "Infy LMS — the platform layer for course creation, live-led delivery, and analytics." },
      { name: "Skill assessment & proctoring", description: "Infy Assess — assessment and benchmarking with AI proctoring and coding evaluation." },
    ],
  },
  {
    name: "Elearning Solutions",
    slug: "elearning-solutions",
    voiceGuide: `ELEARNING SOLUTIONS (Digital Course Production) — BRAND VOICE  [confirm/edit with the team]
Audience: university/college L&D and academic leadership, ed-tech content
  teams, and corporate L&D buyers procuring course production as a SERVICE —
  not a software buyer, a "make this expertise into a great course" buyer.
Personality: production-craft-forward, process-driven, a single accountable
  partner across the whole lifecycle ("Plan -> Produce -> Launch ->
  Optimize"). Distinct from InfyLearn (that's the technology stack) and from
  Board Infinity's own hiring-readiness business — this is people + process
  turning expertise into finished digital courses.
Do: name the concrete production craft (instructional design, storyboards,
  studio-quality video, motion graphics, LMS deployment); cite real proof
  points from the deck (40% faster course launch, 35% higher engagement, 30%
  better completion, 25% lower faculty workload); reference the "expertise
  alone doesn't create effective digital learning" problem framing.
Don't: sound like a generic video-production vendor — always tie back to
  learning outcomes and faculty-workload relief, not just production values.
Litmus test: would an academic dean read this and think "this team will
  actually reduce my faculty's burden, not just make a nicer-looking video"?
  If not, it doesn't ship.`,
    visualNotes: "Behind-the-scenes production + course-architecture diagrams over generic stock photography.",
    bannedTopics: ["politics", "competitor bashing", "unverifiable claims", "naming institutional clients without sign-off"],
    defaultCompetitors: ["Hurix Digital", "Tesseract Learning", "CommLab India", "MPS Interactive"],
    pillars: [
      { name: "Instructional design & course architecture", description: "Curriculum architecture, learner-persona-driven design, storyboards and engagement mapping." },
      { name: "Studio-quality content production", description: "Video recording, motion graphics, and branded visual frameworks that translate expertise into digital formats." },
      { name: "LMS deployment & launch operations", description: "Taking a designed course from production into a live, assessed, trackable learning experience." },
      { name: "Data-backed course optimization", description: "Engagement tracking, cohort performance analysis, and continuous content improvement after launch." },
    ],
  },
];

export async function seed(): Promise<void> {
  if (!config.db.enabled) throw new Error("DATABASE_URL not set — cannot seed.");
  await migrate();

  let brand = await brands.getByName("Board Infinity");
  if (!brand) {
    brand = await brands.create({
      name: "Board Infinity",
      slug: "board-infinity",
      voice_guide: DEFAULT_VOICE_GUIDE,
      visual_notes: "Consistent template + signature POV voice (§4 distinctive assets).",
      banned_topics: ["politics", "competitor bashing", "unverifiable claims"],
      default_competitors: ["Superset", "Mettl", "Unstop", "HackerEarth", "HirePro", "eLitmus"],
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

  // The other brand lines (multi-brand support) — no fabricated sample owned
  // material for these: better to start with zero owned assets (drafts will
  // honestly flag low_source until someone ingests real material) than to
  // invent case studies for a brand we don't actually have proof points for.
  for (const bs of BRAND_SEEDS) {
    let b = await brands.getBySlug(bs.slug);
    if (!b) {
      b = await brands.create({
        name: bs.name,
        slug: bs.slug,
        voice_guide: bs.voiceGuide,
        visual_notes: bs.visualNotes,
        banned_topics: bs.bannedTopics,
        default_competitors: bs.defaultCompetitors,
      });
      logger.info({ brandId: b.id, name: bs.name }, "seed: created brand");
    }
    const bPillars = await pillars.listActive(b.id);
    if (bPillars.length === 0) {
      for (const p of bs.pillars) await pillars.create({ brand_id: b.id, ...p });
      logger.info({ brand: bs.name, count: bs.pillars.length }, "seed: created pillars");
    }
    const bChannels = await channels.list(b.id);
    if (bChannels.length === 0) {
      await channels.create({
        brand_id: b.id,
        platform: "linkedin",
        weekly_target: 3,
        allowed_media: ["text", "image"],
        monthly_budget_usd: 100,
      });
      logger.info({ brand: bs.name }, "seed: created LinkedIn channel config");
    }
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
