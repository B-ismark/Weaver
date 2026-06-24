import Link from "next/link";
import { SkeletonFeed } from "@/components/SkeletonFeed";

/**
 * Streamed instantly while the search page awaits the (slow) CLIP text-embed +
 * vector query. Turns the old dead delay into immediate "Searching…" feedback.
 */
export default function SearchLoading() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-surface bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Feed
          </Link>
          <span className="text-sm text-muted">Searching…</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <SkeletonFeed count={12} label="Finding matches…" />
      </main>
    </>
  );
}
