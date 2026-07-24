"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsOwner } from "./OwnerProvider";

/**
 * Primary nav (Library / Taste / Add / Import) for the SiteHeader children slot.
 * One definition instead of the same links re-declared on every page, with the
 * current page highlighted (aria-current). Client-only for usePathname.
 *
 * These are all OWNER-only management surfaces (Weaver is public-facing), so the
 * whole nav is hidden from visitors — they only ever see the wordmark. The routes
 * are gated at the proxy too; this just keeps the header clean for browsers.
 */
const LINKS = [
  { href: "/library", label: "Library" },
  { href: "/taste", label: "Taste" },
  { href: "/add", label: "Add" },
  { href: "/import", label: "Import" },
] as const;

export function PrimaryNav() {
  const pathname = usePathname();
  const owner = useIsOwner();
  if (!owner) return null;
  return (
    <nav className="flex shrink-0 items-center gap-3 text-sm sm:gap-4" aria-label="Primary">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={active ? "text-foreground" : "text-muted hover:text-foreground"}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
