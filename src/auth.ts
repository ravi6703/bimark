import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

/**
 * Named-account auth for the dashboard (audit Phase 0). Every dashboard action
 * now carries a real person's identity instead of the old single shared
 * ADMIN_PASSWORD, so the `approvals` audit trail means something for a team.
 * Tokens stay stateless (no session store — matters on serverless): the
 * payload is base64url JSON, HMAC-signed with `config.admin.tokenSecret`.
 */
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days
const SCRYPT_KEYLEN = 64;

export interface AuthIdentity {
  uid: number;
  name: string;
}

function sign(payload: string): string {
  return createHmac("sha256", config.admin.tokenSecret).update(payload).digest("hex");
}

/** Scrypt password hashing for the `users` table — no extra dependency. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/**
 * The old shared secret, kept only to gate bootstrapping the first named
 * account on a fresh install (see api/auth/login.ts) — not a login path.
 */
export function checkLegacyPassword(candidate: string): boolean {
  if (!config.admin.password) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(config.admin.password);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueToken(identity: AuthIdentity): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ uid: identity.uid, name: identity.name, exp })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined | null): AuthIdentity | null {
  if (!config.admin.enabled || !token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let decoded: { uid?: unknown; name?: unknown; exp?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof decoded.uid !== "number" ||
    typeof decoded.name !== "string" ||
    typeof decoded.exp !== "number" ||
    Date.now() > decoded.exp
  ) {
    return null;
  }
  return { uid: decoded.uid, name: decoded.name };
}

/** Extracts the bearer token from an Authorization header value. */
export function bearerToken(authHeader: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}
