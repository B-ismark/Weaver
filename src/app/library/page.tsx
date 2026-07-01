import { MasonryFeed } from "@/components/MasonryFeed";
import { SiteHeader } from "@/components/SiteHeader";
import { PrimaryNav } from "@/components/PrimaryNav";
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
      <SiteHeader>
        <PrimaryNav />
      </SiteHeader>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Your library
          </h1>
          <p className="mt-1 text-sm text-muted">
            {items.length === 0
              ? "The threads that shape your taste — imported saves and anything you keep."
              : `${items.length} item${items.length === 1 ? "" : "s"} shaping your taste.`}
          </p>
        </div>

        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            Nothing here yet. Import your saves, or save images from the feed.
          </p>
        ) : (
          <MasonryFeed items={items} showActions={false} />
        )}
      </main>
    </>
  );
}
