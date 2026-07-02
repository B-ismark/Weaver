import { InfiniteFeed } from "@/components/InfiniteFeed";
import { AppHeader } from "@/components/AppHeader";
import { Onboarding } from "@/components/Onboarding";
import { BackToTop } from "@/components/BackToTop";
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
      <AppHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Reveal className="mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Woven for you
          </h1>
        </Reveal>

        {items.length === 0 ? (
          <Onboarding />
        ) : (
          <InfiniteFeed initial={items} />
        )}
      </main>

      {/* Reveals only while scrolling back up a long feed. */}
      <BackToTop />
    </>
  );
}
