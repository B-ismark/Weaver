import Link from "next/link";
import { MasonryFeed } from "@/components/MasonryFeed";
import { getLibraryItems } from "@/lib/items";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library · Weaver" };

/**
 * Library — your taste set: everything you imported plus anything you've saved
 * from discovery. This is the signal that drives the feed; shown read-only
 * (no save/hide actions) since these are already "yours".
 */
export default async function LibraryPage() {
  const items = await getLibraryItems();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-surface bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">Library</h1>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Feed
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            Nothing here yet. Import your saves, or save images from the feed.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              {items.length} item{items.length === 1 ? "" : "s"} shaping your taste
            </p>
            <MasonryFeed items={items} showActions={false} />
          </>
        )}
      </main>
    </>
  );
}
