import { SiteHeader } from "@/components/SiteHeader";

export const metadata = {
  title: "Privacy Policy · Weaver",
  description: "How Weaver handles your data.",
};

/**
 * Privacy policy — required for Pinterest API access (and just good practice).
 * Static, public, clearly labeled, hosted on the app's own domain. Single-user
 * personal app: read-only access to the owner's own content, nothing shared.
 */
export default function PrivacyPage() {
  return (
    <>
      {/* Public page (pre-auth Pinterest reviewers land here) — wordmark links
          home, no nav to gate-protected pages. */}
      <SiteHeader maxWidth="max-w-3xl" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <article className="flex flex-col gap-6 text-sm leading-relaxed text-foreground">
          <p className="text-muted">Last updated: 20 June 2026</p>

          <p>
            Weaver is a personal, single-user application that gathers images its owner has saved or
            engaged with across their own accounts and ranks them by visual taste. It is operated by
            an individual for personal use and has no other users.
          </p>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">What data Weaver accesses</h2>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>
                With your explicit authorization, Weaver reads <strong>your own</strong> Pinterest
                boards and pins (scopes <code>boards:read</code>, <code>pins:read</code>), read-only.
                It never creates, edits, or deletes anything on Pinterest.
              </li>
              <li>
                For each image it stores the image URL, a link back to the source, a title/caption,
                dimensions, and a numerical embedding (a vector used only to rank images by
                similarity). No personal profile data is collected.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">How it is used</h2>
            <p className="text-muted">
              Solely to build a private, taste-ranked image feed for the account owner. Data is
              never sold, shared, published, or shown to anyone else. There is no advertising and no
              third-party analytics or tracking.
            </p>
            <p className="text-muted">
              Image embeddings are produced with a pre-trained model for similarity ranking only.
              Weaver does <strong>not</strong> use Pinterest data, or any data it accesses, to
              train machine-learning or AI models.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Service providers</h2>
            <p className="text-muted">
              Data is stored and processed only by the infrastructure running Weaver:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Supabase: database and image storage</li>
              <li>Vercel: application hosting</li>
              <li>A private Hugging Face Space: computes image embeddings</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Retention &amp; your control</h2>
            <p className="text-muted">
              Data is retained until the owner deletes it. You can revoke Weaver&apos;s access at any
              time from your Pinterest account settings (Apps &amp; permissions); access tokens are
              then invalidated and no further data is read.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Contact</h2>
            <p className="text-muted">
              Questions about this policy:{" "}
              <a className="underline hover:text-foreground" href="mailto:bismark.gyau@amalitech.com">
                bismark.gyau@amalitech.com
              </a>
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
