import Link from "next/link";
import { ImportForm } from "@/components/ImportForm";
import { PinterestPanel } from "@/components/PinterestPanel";
import { isConfigured, isConnected, canStartOAuth } from "@/lib/pinterest";

export const metadata = { title: "Import · Weaver" };

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ pinterest?: string }>;
}) {
  const { pinterest } = await searchParams;
  const configured = isConfigured();
  const connected = configured ? await isConnected() : false;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-surface bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">Import</h1>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Feed
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="mb-6 max-w-prose text-sm text-muted">
          Bring in images you&apos;ve saved. Request your data export from the platform, unzip it,
          and upload the saved-pins file. Everything runs through one normalized pipeline, so the
          feed treats every source the same.
        </p>
        <PinterestPanel
          configured={configured}
          connected={connected}
          canOAuth={canStartOAuth()}
          status={pinterest}
        />
        <ImportForm />
      </main>
    </>
  );
}
