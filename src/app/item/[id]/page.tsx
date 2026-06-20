import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getItemById, getSimilarItems } from "@/lib/items";
import { MasonryFeed } from "@/components/MasonryFeed";
import { SourceOutLink } from "@/components/SourceOutLink";
import { ItemActions } from "@/components/ItemActions";

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
      <header className="sticky top-0 z-10 border-b border-surface bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Feed
          </Link>
          <span className="text-xs capitalize text-muted">{item.platform}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          {/* Full-resolution, hotlinked (§5.2). Falls back to source link on 403. */}
          <div
            className="relative w-full overflow-hidden rounded-2xl bg-surface"
            style={{ aspectRatio: `${item.width} / ${item.height}` }}
          >
            <Image
              src={item.fullUrl}
              alt={item.caption || "Image"}
              fill
              sizes="(max-width: 768px) 100vw, 66vw"
              className="object-contain"
              priority
            />
          </div>

          <aside className="flex flex-col gap-4">
            {item.caption && <h1 className="text-lg font-medium">{item.caption}</h1>}
            <SourceOutLink itemId={item.id} href={item.sourceLink} platform={item.platform} />
            <ItemActions itemId={item.id} sourceLink={item.sourceLink} caption={item.caption} variant="bar" />
          </aside>
        </div>

        {similar.length > 0 && (
          <section className="mt-10" aria-labelledby="more-like-this">
            <h2 id="more-like-this" className="mb-4 text-sm font-semibold tracking-tight">
              More like this
            </h2>
            <MasonryFeed items={similar} />
          </section>
        )}
      </main>
    </>
  );
}
