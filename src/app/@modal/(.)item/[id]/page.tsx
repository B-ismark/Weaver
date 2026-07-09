import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getItemById, getSimilarItems } from "@/lib/items";
import { MasonryFeed } from "@/components/MasonryFeed";
import { SkeletonFeed } from "@/components/SkeletonFeed";
import { Lightbox } from "@/components/Lightbox";

export const dynamic = "force-dynamic";

/**
 * Intercepted detail view (§2) — shown as an OVERLAY over the feed when a tile is
 * tapped via client navigation. `(.)item/[id]` intercepts the sibling
 * `/item/[id]` route so the feed underneath stays mounted (enabling the
 * tile→hero morph + neighbour reflow). A hard load / refresh of `/item/[id]`
 * skips interception and renders the full standalone page instead.
 *
 * PERF mirrors the standalone page: only the fast single-row `getItemById` is
 * awaited before the hero paints (so the morph fires immediately); the slow
 * pgvector "more like this" streams in behind <Suspense>.
 */
export default async function InterceptedItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItemById(id);
  if (!item) notFound();

  return (
    <Lightbox
      item={item}
      similar={
        <Suspense fallback={<SimilarFrame><SkeletonFeed count={6} /></SimilarFrame>}>
          <SimilarSection id={id} />
        </Suspense>
      }
    />
  );
}

/** Heading + gold thread rule — the weave connecting this node to its neighbours. */
function SimilarFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-10" aria-labelledby="modal-more-like-this">
      <div className="mb-5 flex items-center gap-3">
        <h2 id="modal-more-like-this" className="font-display text-lg font-semibold tracking-tight">
          Threads from this
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-accent/40" />
      </div>
      {children}
    </section>
  );
}

async function SimilarSection({ id }: { id: string }) {
  const similar = await getSimilarItems(id);
  if (similar.length === 0) return null;
  return (
    <SimilarFrame>
      {/* morph off: these tiles live inside the overlay and must not drive the
          still-mounted feed's reflow behind the backdrop. Tapping one still
          navigates (a fresh overlay), just without the shared-element flight. */}
      <MasonryFeed items={similar} morph={false} />
    </SimilarFrame>
  );
}
