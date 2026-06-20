import { buildAuthUrl, canStartOAuth } from "@/lib/pinterest";

/**
 * GET /api/pinterest/auth — start the Pinterest OAuth flow (D4). Sets a signed
 * `state` cookie for CSRF protection, then 302-redirects to Pinterest consent.
 * Pinterest sends the user back to /api/pinterest/callback.
 */
export async function GET(): Promise<Response> {
  if (!canStartOAuth()) {
    return Response.json(
      { error: "OAuth not configured (need PINTEREST_CLIENT_ID/SECRET/REDIRECT_URI)" },
      { status: 501 }
    );
  }

  const state = crypto.randomUUID();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const res = new Response(null, { status: 302, headers: { Location: buildAuthUrl(state) } });
  res.headers.append(
    "Set-Cookie",
    `pinterest_oauth_state=${state}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=600`
  );
  return res;
}
