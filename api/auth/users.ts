import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { hashPassword } from "../../src/auth.js";
import { users } from "../../src/db/repositories/index.js";
import { logger } from "../../src/logger.js";

/**
 * GET /api/auth/users — list teammates (names only, no password hashes).
 * POST /api/auth/users { name, password } — add a teammate.
 *
 * Any logged-in user can add another (audit Phase 0: "named accounts, not
 * full RBAC" — right-sized for a small internal team, not a role hierarchy).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    try {
      const rows = await users.list();
      res.status(200).json({ ok: true, users: rows });
    } catch (err) {
      logger.error({ err }, "users list failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  if (req.method === "POST") {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!name || password.length < 8) {
      res.status(400).json({ error: "name and an 8+ character password are required" });
      return;
    }
    try {
      if (await users.getByName(name)) {
        res.status(409).json({ error: "that name is already taken" });
        return;
      }
      const created = await users.create({ name, password_hash: hashPassword(password) });
      res.status(200).json({ ok: true, user: { id: created.id, name: created.name } });
    } catch (err) {
      logger.error({ err }, "create teammate failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
