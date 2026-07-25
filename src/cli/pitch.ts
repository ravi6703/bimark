import { logger } from "../logger.js";
import { brands } from "../db/repositories/index.js";
import { closePool } from "../db/pool.js";
import { runMorningPitch } from "../workflows/wf1_morningPitch.js";

/** `npm run pitch` — trigger the morning pitch on demand (WF-1). */
async function main() {
  const b = await brands.first();
  if (!b) throw new Error("no brand — run `npm run seed`");
  const { group, topicA, topicB } = await runMorningPitch(b.id);
  logger.info({ group, topicA: topicA.id, topicB: topicB.id }, "pitch sent");
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "pitch CLI failed");
    process.exit(1);
  });
