import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkPassword, issueToken } from "../../src/auth.js";
import { config } from "../../src/config.js";

/** Dashboard login — POST { password } → { token }. See src/auth.ts. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!config.admin.enabled) {
    res.status(503).json({ error: "ADMIN_PASSWORD not configured on the server" });
    return;
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!checkPassword(password)) {
    res.status(401).json({ error: "incorrect password" });
    return;
  }
  res.status(200).json({ token: issueToken() });
}
