import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkLegacyPassword, hashPassword, issueToken, verifyPassword } from "../../src/auth.js";
import { config } from "../../src/config.js";
import { users } from "../../src/db/repositories/index.js";
import { logger } from "../../src/logger.js";

/**
 * Dashboard login — POST { name, password } → { token }.
 *
 * Named-account auth (audit Phase 0): a real name per person instead of one
 * shared password, so every dashboard action attributes to someone real.
 * Bootstrap: on a fresh install (zero rows in `users`), logging in with the
 * legacy ADMIN_PASSWORD creates the first named account under the given
 * name — no manual DB work required. After that, every login checks the
 * `users` table normally; new teammates are added via POST /api/auth/users.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!config.admin.enabled) {
    res.status(503).json({ error: "auth not configured on the server" });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!name || !password) {
    res.status(400).json({ error: "name and password are required" });
    return;
  }

  try {
    const existing = await users.getByName(name);
    if (existing) {
      if (!verifyPassword(password, existing.password_hash)) {
        res.status(401).json({ error: "incorrect password" });
        return;
      }
      res.status(200).json({ token: issueToken({ uid: existing.id, name: existing.name }) });
      return;
    }

    // No account under this name yet — allow bootstrapping the first ever
    // account (and only the first) with the legacy shared password.
    if ((await users.count()) > 0) {
      res.status(401).json({ error: "no account with that name — ask a teammate to add you" });
      return;
    }
    if (!checkLegacyPassword(password)) {
      res.status(401).json({ error: "incorrect password" });
      return;
    }
    const created = await users.create({ name, password_hash: hashPassword(password) });
    logger.info({ name }, "auth: bootstrapped first named account");
    res.status(200).json({ token: issueToken({ uid: created.id, name: created.name }) });
  } catch (err) {
    logger.error({ err }, "login failed");
    res.status(500).json({ error: "internal error" });
  }
}
