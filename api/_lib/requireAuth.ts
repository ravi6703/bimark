import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearerToken, verifyToken } from "../../src/auth.js";

/** Gate for the dashboard's data endpoints — see src/auth.ts. */
export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  const token = bearerToken(req.headers.authorization);
  if (!verifyToken(token)) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}
