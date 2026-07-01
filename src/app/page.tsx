import { MasonryFeed } from "@/components/MasonryFeed";
import { SearchBar } from "@/components/SearchBar";
import { SiteHeader } from "@/components/SiteHeader";
import { PrimaryNav } from "@/components/PrimaryNav";
import { DiscoverButton } from "@/components/DiscoverButton";
import { Reveal } from "@/components/motion/Reveal";
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
      <SiteHeader>
        <div className="hidden flex-1 justify-center sm:flex">
          <SearchBar />
        </div>
        <PrimaryNav />
      </SiteHeader>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Reveal className="mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Woven for you
          </h1>
        </Reveal>

        {items.length === 0 ? (
          <div className="mx-auto max-w-prose py-16 text-center">
            <h2 className="font-display text-xl font-medium">No discoveries yet</h2>
            <p className="mt-2 text-sm text-muted">
              Weaver learns your taste from what you&apos;ve imported, then surfaces{" "}
              <em>new</em> content you haven&apos;t seen. Run a discovery refresh to fill the feed.
            </p>
            <DiscoverButton />
          </div>
        ) : (
          <MasonryFeed items={items} />
        )}
      </main>
    </>
  );
}
