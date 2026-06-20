import { exchangeCode } from "@/lib/pinterest";

/**
 * GET /api/pinterest/callback — OAuth redirect target (D4). Verifies the CSRF
 * `state` against the cookie, exchanges the code for tokens (persisted to
 * oauth_tokens), then redirects back to /import with a status flag.
 */
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const flag = (status: string) => {
    const to = new URL("/import", url.origin);
    to.searchParams.set("pinterest", status);
    const res = new Response(null, { status: 302, headers: { Location: to.toString() } });
    // clear the one-shot state cookie
    res.headers.append("Set-Cookie", "pinterest_oauth_state=; HttpOnly; Path=/; Max-Age=0");
    return res;
  };

  if (url.searchParams.get("error")) return flag("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = readCookie(request, "pinterest_oauth_state");
  if (!code || !state || !cookieState || state !== cookieState) {
    return flag("bad_state");
  }

  try {
    await exchangeCode(code);
  } catch {
    return flag("error");
  }
  return flag("connected");
}
