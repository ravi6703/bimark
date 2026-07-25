import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearerToken, verifyToken, type AuthIdentity } from "../../src/auth.js";

/**
 * Gate for the dashboard's data endpoints — see src/auth.ts. Returns the
 * authenticated user's identity (so callers can attribute an action to a real
 * person), or null after writing the 401 response.
 */
export function requireAuth(req: VercelRequest, res: VercelResponse): AuthIdentity | null {
  const token = bearerToken(req.headers.authorization);
  const identity = verifyToken(token);
  if (!identity) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return identity;
}
