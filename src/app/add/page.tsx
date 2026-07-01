import { AppHeader } from "@/components/AppHeader";
import { AddForm } from "@/components/AddForm";

export const dynamic = "force-dynamic";

/**
 * Add-by-URL / bookmarklet landing page. Also the destination the bookmarklet
 * opens (/add?url=…) — AddForm prefills + auto-submits from the query.
 */
export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; error?: string }>;
}) {
  const { url } = await searchParams;

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Add to your taste</h1>
        <p className="mt-2 mb-6 text-sm text-muted">
          Paste a link from anywhere — a pin, a post, an artwork page, or a direct
          image. Weaver reads its image, learns from it, and lets it shape your feed.
          On mobile, install Weaver and use the <em>Share</em> sheet instead.
        </p>
        <AddForm initialUrl={url ?? ""} />
      </main>
    </>
  );
}
