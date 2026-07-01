import { SkeletonFeed } from "@/components/SkeletonFeed";
import { SiteHeader } from "@/components/SiteHeader";
import { PrimaryNav } from "@/components/PrimaryNav";

/**
 * Streamed instantly while the search page awaits the (slow) CLIP text-embed +
 * vector query. Turns the old dead delay into immediate "Searching…" feedback.
 */
export default function SearchLoading() {
  return (
    <>
      <SiteHeader>
        <span className="text-sm text-muted">Searching…</span>
        <PrimaryNav />
      </SiteHeader>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <SkeletonFeed count={12} label="Finding matches…" />
      </main>
    </>
  );
}
