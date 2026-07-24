import { cookies } from "next/headers";
import { SESSION_COOKIE, expectedToken } from "./auth";

/**
 * Server-side owner check (single-user). Weaver is now public-facing: visitors can
 * browse the feed + item detail, but the management surfaces (Library, Taste, Add,
 * Import, Search) and every taste-mutating action are the OWNER's alone. The proxy
 * gate (proxy.ts) is what actually enforces this on the network; this helper lets
 * the UI hide owner-only controls so visitors never see a button that would 401.
 *
 * Owner = the same valid session cookie the proxy accepts. With no WEAVER_PASSCODE
 * set (local dev) the gate is open, so everyone is treated as the owner.
 *
 * Kept out of auth.ts on purpose: auth.ts is imported by the proxy (edge-style,
 * no next/headers), so the cookies() dependency lives here instead.
 */
export async function isOwner(): Promise<boolean> {
  const token = await expectedToken();
  if (!token) return true; // no passcode configured → gate open → treat as owner
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value === token;
}
