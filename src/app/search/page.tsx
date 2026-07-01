import { MasonryFeed } from "@/components/MasonryFeed";
import { SearchBar } from "@/components/SearchBar";
import { SiteHeader } from "@/components/SiteHeader";
import { PrimaryNav } from "@/components/PrimaryNav";
import { embedQuery } from "@/lib/embedText";
import { searchByVector } from "@/lib/items";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search · Weaver" };

/**
 * Semantic search results (§8.4). Embeds the query via the CLIP text tower, then
 * cosine-matches against image vectors. Degrades clearly when the endpoint isn't
 * configured or no embeddings exist yet.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = q.trim();

  const vector = term ? await embedQuery(term) : null;
  const results = vector ? await searchByVector(vector) : [];

  return (
    <>
      <SiteHeader>
        <SearchBar initial={term} />
        <PrimaryNav />
      </SiteHeader>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {!term && <p className="text-sm text-muted">Type a query to search your images.</p>}

        {term && !vector && (
          <p className="text-sm text-muted">
            Search isn&apos;t available — the embedding endpoint isn&apos;t configured (set
            <code className="mx-1">EMBED_ENDPOINT</code>) or it timed out.
          </p>
        )}

        {term && vector && results.length === 0 && (
          <p className="text-sm text-muted">
            No matches for “{term}”. (Images need embeddings — run the embedding script.)
          </p>
        )}

        {results.length > 0 && (
          <>
            <p className="mb-4 text-sm text-muted">
              Results for “{term}”
            </p>
            <MasonryFeed items={results} />
          </>
        )}
      </main>
    </>
  );
}
