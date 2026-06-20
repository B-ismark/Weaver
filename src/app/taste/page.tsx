import Link from "next/link";
import { TasteManager } from "@/components/TasteManager";

export const metadata = { title: "Taste · Weaver" };

/**
 * Taste control (Pinterest "tune your feed"). Manage the keywords that steer
 * discovery. Keywords embed into the same CLIP space as images, so they shape
 * the ranked feed directly (discovery spec §5.2/§9).
 */
export default function TastePage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-surface bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">Tune your taste</h1>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Feed
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
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
