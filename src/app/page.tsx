import Link from "next/link";
import { MasonryFeed } from "@/components/MasonryFeed";
import { SearchBar } from "@/components/SearchBar";
import { getFeedItems } from "@/lib/items";

// Feed reflects the live store on every request (re-reads after each discovery refresh).
export const dynamic = "force-dynamic";

/**
 * Home feed (discovery, v2). Shows NEW taste-ranked candidate content (§2 of the
 * discovery spec) — not the user's own library. Empty until a discovery refresh
 * has pulled candidates.
 */
export default async function HomePage() {
  const items = await getFeedItems();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-surface bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <h1 className="shrink-0 text-lg font-semibold tracking-tight">Weaver</h1>
          <div className="flex flex-1 justify-center">
            <SearchBar />
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <Link href="/library" className="text-sm text-muted hover:text-foreground">
              Library
            </Link>
            <Link href="/taste" className="text-sm text-muted hover:text-foreground">
              Taste
            </Link>
            <Link href="/import" className="text-sm text-muted hover:text-foreground">
              Import
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {items.length === 0 ? (
          <div className="mx-auto max-w-prose py-16 text-center">
            <h2 className="text-base font-medium">No discoveries yet</h2>
            <p className="mt-2 text-sm text-muted">
              Weaver learns your taste from what you&apos;ve imported, then surfaces{" "}
              <em>new</em> content you haven&apos;t seen. Run a discovery refresh to fill the feed.
            </p>
          </div>
        ) : (
          <MasonryFeed items={items} />
        )}
      </main>
    </>
  );
}
