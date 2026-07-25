import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

/**
 * Minimal auth for the dashboard (single shared password — matches the PRD's
 * single "editor-in-chief" operator model, §9; not a multi-user system).
 * Tokens are self-contained and stateless: `<expiryMs>.<hmac(expiryMs)>`,
 * signed with the admin password itself as the HMAC key. No session store
 * needed, which matters on serverless (no shared memory between invocations).
 */
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

function sign(payload: string): string {
  return createHmac("sha256", config.admin.password).update(payload).digest("hex");
}

export function checkPassword(candidate: string): boolean {
  if (!config.admin.enabled) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(config.admin.password);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueToken(): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${sign(String(exp))}`;
}

export function verifyToken(token: string | undefined | null): boolean {
  if (!config.admin.enabled || !token) return false;
  const [expStr, sig] = token.split(".");
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const expected = sign(expStr);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Extracts the bearer token from an Authorization header value. */
export function bearerToken(authHeader: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}
