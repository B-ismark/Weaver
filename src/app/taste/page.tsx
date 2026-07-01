import { TasteManager } from "@/components/TasteManager";
import { SiteHeader } from "@/components/SiteHeader";
import { PrimaryNav } from "@/components/PrimaryNav";

export const metadata = { title: "Taste · Weaver" };

/**
 * Taste control (Pinterest "tune your feed"). Manage the keywords that steer
 * discovery. Keywords embed into the same CLIP space as images, so they shape
 * the ranked feed directly (discovery spec §5.2/§9).
 */
export default function TastePage() {
  return (
    <>
      <SiteHeader maxWidth="max-w-3xl">
        <PrimaryNav />
      </SiteHeader>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Tune your taste
        </h1>
        <p className="mb-6 max-w-prose text-sm text-muted">
          Weaver learns from what you&apos;ve imported, but you can steer it directly. Add concepts
          you want <em>more</em> of, or mute what you want <em>less</em> of — each one nudges the
          discovery feed.
        </p>
        <TasteManager />
      </main>
    </>
  );
}
