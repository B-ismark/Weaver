import Image from "next/image";
import { ViewTransition } from "react";
import { notFound } from "next/navigation";
import { getItemById, getSimilarItems } from "@/lib/items";
import { shouldOptimize } from "@/lib/imageHost";
import { MasonryFeed } from "@/components/MasonryFeed";
import { AppHeader } from "@/components/AppHeader";
import { SourceOutLink } from "@/components/SourceOutLink";
import { ItemActions } from "@/components/ItemActions";
import { BackButton } from "@/components/BackButton";
import { Reveal } from "@/components/motion/Reveal";

export const dynamic = "force-dynamic";

/**
 * Detail view (§2): enlarge the image, show platform + caption, link out to the
 * original, and surface "more like this" (§6.1). Server component.
 */
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItemById(id);
  if (!item) notFound();

  const similar = await getSimilarItems(id);

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {/* Back sits between the nav and the image, not in the nav, so the nav
            stays identical to the feed and anchors the morph. */}
        <div className="mb-4">
          <BackButton />
        </div>
        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          {/* Full-resolution, hotlinked (§5.2). Falls back to source link on 403. */}
          <div
            className="relative w-full overflow-hidden rounded-2xl bg-surface"
            style={{ aspectRatio: `${item.width} / ${item.height}` }}
          >
            {/* Same name as the feed thumbnail → the tile morphs into this hero. */}
            <ViewTransition name={`item-${item.id}`} share="morph">
              <Image
                src={item.fullUrl}
                alt={item.caption || "Image"}
                fill
                sizes="(max-width: 768px) 100vw, 66vw"
                unoptimized={!shouldOptimize(item.fullUrl)}
                className="object-contain"
                priority
              />
            </ViewTransition>
          </div>

          <Reveal className="flex flex-col gap-4" delay={0.1}>
            <aside className="flex flex-col gap-4">
              {item.caption && (
                <h1 className="font-display text-2xl font-medium leading-snug">{item.caption}</h1>
              )}
              <SourceOutLink itemId={item.id} href={item.sourceLink} platform={item.platform} />
              <ItemActions itemId={item.id} sourceLink={item.sourceLink} caption={item.caption} variant="bar" initialLiked={item.saved} />
            </aside>
          </Reveal>
        </div>

        {similar.length > 0 && (
          <section className="mt-12" aria-labelledby="more-like-this">
            <div className="mb-5 flex items-center gap-3">
              <h2
                id="more-like-this"
                className="font-display text-xl font-semibold tracking-tight"
              >
                Threads from this
              </h2>
              {/* Gold thread rule — the weave connecting this node to its neighbours. */}
              <span aria-hidden="true" className="h-px flex-1 bg-accent/40" />
            </div>
            <MasonryFeed items={similar} />
          </section>
        )}
      </main>
    </>
  );
}
