import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Vercel invokes scheduled functions with `Authorization: Bearer <CRON_SECRET>`
 * when the CRON_SECRET env var is set on the project. Reject anything else so
 * the cron endpoints (WF-1/6/7) can't be triggered by a stray public request.
 * See https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 *
 * If CRON_SECRET is unset (e.g. local `vercel dev`), the check is skipped —
 * set it in the Vercel project's env vars before going to production.
 */
export function assertCronAuthorized(req: VercelRequest, res: VercelResponse): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev fallback — no secret configured yet

  const header = req.headers.authorization;
  if (header !== `Bearer ${secret}`) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}
