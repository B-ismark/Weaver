import { SESSION_COOKIE, expectedToken, passcodeMatches } from "@/lib/auth";

/**
 * POST /api/auth/login — exchange the passcode for a session cookie (D-gate).
 * Body: { passcode }. Sets an HttpOnly session cookie on success.
 */
export async function POST(request: Request): Promise<Response> {
  let passcode = "";
  try {
    const body = (await request.json()) as { passcode?: string };
    passcode = body?.passcode ?? "";
  } catch {
    // empty body
  }

  if (!passcodeMatches(passcode)) {
    return Response.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  const token = await expectedToken();
  if (!token) {
    // No passcode configured → gate is off; nothing to log into.
    return Response.json({ ok: true });
  }

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`
  );
  return res;
}
