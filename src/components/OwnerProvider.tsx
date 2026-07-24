"use client";

import { createContext, useContext } from "react";

/**
 * Broadcasts the owner flag (computed once on the server via lib/owner.isOwner)
 * to every client component, so owner-only controls can hide themselves without
 * threading a prop through the whole tree. The session cookie is HttpOnly, so JS
 * can't read it directly — the server computes ownership and seeds it here.
 *
 * This is UX only: the real boundary is the proxy gate. A visitor who forged this
 * flag would still be 401'd by the mutating APIs / owner-only routes.
 *
 * Defaults to false so anything rendered outside the provider reads as "visitor"
 * (fail closed — hide, don't expose).
 */
const OwnerContext = createContext(false);

export function OwnerProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>;
}

export function useIsOwner(): boolean {
  return useContext(OwnerContext);
}
