import { Suspense } from "react";
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
        <p className="mt-1 text-sm text-muted">Enter the passcode to continue.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
