"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary nav (Library / Taste / Import) for the SiteHeader children slot. One
 * definition instead of the same three links re-declared on every page, with the
 * current page highlighted (aria-current). Client-only for usePathname.
 */
const LINKS = [
  { href: "/library", label: "Library" },
  { href: "/taste", label: "Taste" },
  { href: "/import", label: "Import" },
] as const;

export function PrimaryNav() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 items-center gap-4 text-sm" aria-label="Primary">
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
