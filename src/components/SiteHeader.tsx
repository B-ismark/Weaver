import Link from "next/link";

/**
 * Shared editorial header shell. A serif wordmark with a small gold "hub" glyph
 * (the orb-weaver motif). Page-specific controls (nav, search) are passed as
 * `children` and sit on the right; an optional `leading` slot sits just after the
 * wordmark on the left (e.g. a Back button). The wordmark always routes home.
 *
 * Modular by design: every page composes this instead of re-declaring the sticky
 * shell, so header styling stays in one place (foundational: modularity).
 */
export function SiteHeader({
  children,
  leading,
  maxWidth = "max-w-7xl",
}: {
  children?: React.ReactNode;
  leading?: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-surface bg-background/80 backdrop-blur">
      <div className={`mx-auto flex ${maxWidth} items-center gap-4 px-4 py-3`}>
        <Link
          href="/"
          aria-label="Weaver home"
          className="group flex shrink-0 items-center gap-2 focus-visible:outline-none"
        >
          {/* Gold hub glyph: a tiny nod to the web at the center of the mark. */}
          <span
            aria-hidden="true"
            className="inline-block size-2 rounded-full bg-accent transition-transform duration-300 group-hover:scale-125"
          />
          <span className="font-display text-xl font-semibold tracking-tight text-foreground">
            Weaver
          </span>
        </Link>
        {leading}
        <div className="flex flex-1 items-center justify-end gap-4">{children}</div>
      </div>
    </header>
  );
}
