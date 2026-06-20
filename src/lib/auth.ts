/**
 * Single-user passcode gate (no accounts — Weaver has one global taste set).
 * The session cookie stores a SHA-256 of the passcode, so the raw secret never
 * travels in the cookie and a valid cookie can't be forged without the passcode.
 * HttpOnly keeps it out of JS. Used by proxy.ts (the gate) and the login route.
 *
 * If WEAVER_PASSCODE is unset, the gate is open (local-dev convenience).
 */
export const SESSION_COOKIE = "weaver_session";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value a valid session must carry, or null when no passcode is set. */
export async function expectedToken(): Promise<string | null> {
  const pass = process.env.WEAVER_PASSCODE;
  if (!pass) return null;
  return sha256Hex(`weaver-session-v1:${pass}`);
}

export function passcodeMatches(input: string): boolean {
  const pass = process.env.WEAVER_PASSCODE;
  return !!pass && input === pass;
}
