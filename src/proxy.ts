import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, expectedToken } from "@/lib/auth";

/**
 * The gate (single-user passcode). Everything is protected EXCEPT:
 *   - public pages: /login, /privacy (Pinterest needs this reachable)
 *   - OAuth return: /api/pinterest/callback (Pinterest redirects here)
 *   - the login API itself
 *   - cron endpoints, when they carry the CRON_SECRET bearer (GitHub Actions)
 * Static assets are excluded via the matcher.
 *
 * Owner access = a session cookie (set by /api/auth/login). No passcode set →
 * gate is open (local dev). This is the single source of auth, so the cron
 * routes no longer self-check the secret — proxy does it here.
 */
const PUBLIC = ["/login", "/privacy", "/api/auth/login", "/api/pinterest/callback"];
const CRON_PATHS = ["/api/discover", "/api/pinterest/sync"];

function isPublic(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const token = await expectedToken();
  if (!token) return NextResponse.next(); // no passcode configured → open

  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Headless cron: allow the discovery/sync endpoints with a valid bearer.
  if (CRON_PATHS.includes(pathname)) {
    const auth = request.headers.get("authorization");
    if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.next();
    }
  }

  if (request.cookies.get(SESSION_COOKIE)?.value === token) {
    return NextResponse.next();
  }

  // Unauthorized: JSON for APIs, redirect to /login for pages.
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except static assets and icon/manifest files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|apple-icon.png|manifest.webmanifest|sw.js).*)",
  ],
};
