import { ImportForm } from "@/components/ImportForm";
import { PinterestPanel } from "@/components/PinterestPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { PrimaryNav } from "@/components/PrimaryNav";
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
      <SiteHeader maxWidth="max-w-3xl">
        <PrimaryNav />
      </SiteHeader>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Import
        </h1>
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
