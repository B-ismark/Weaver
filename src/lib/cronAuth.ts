import "server-only";

/**
 * Shared guard for endpoints a scheduler (GitHub Actions cron, D4) may hit:
 * /api/discover and /api/pinterest/sync. These do real work (network pulls,
 * embedding, writes) so they must not be openly POST-able once deployed.
 *
 * Contract:
 *   - CRON_SECRET unset → allow (local dev convenience; nothing to protect yet).
 *   - CRON_SECRET set   → require `Authorization: Bearer <CRON_SECRET>`
 *                         (also accepts `x-cron-secret: <CRON_SECRET>`).
 *
 * Returns null when the request is authorized, or a 401 Response to return as-is.
 */
export function requireCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null; // unprotected in dev

  const auth = request.headers.get("authorization");
  const header = request.headers.get("x-cron-secret");
  const ok = auth === `Bearer ${secret}` || header === secret;
  if (ok) return null;

  return Response.json({ error: "unauthorized" }, { status: 401 });
}
