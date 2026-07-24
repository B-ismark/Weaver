import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Sign in · Weaver" };

/** Passcode gate entry. Public (proxy allows /login). */
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-2 rounded-full bg-accent" />
          <h1 className="font-display text-2xl font-semibold tracking-tight">Weaver</h1>
        </div>
        <p className="mt-1 text-sm text-muted">
          Enter the passcode to manage Weaver, or browse as a guest.
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      {/* No passcode needed to browse: the feed + detail are public. This just
          drops a guest straight onto the feed instead of stranding them here. */}
      <Link
        href="/"
        className="text-center text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
      >
        Browse as guest →
      </Link>
    </main>
  );
}
