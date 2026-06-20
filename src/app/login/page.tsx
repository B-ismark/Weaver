import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Sign in · Weaver" };

/** Passcode gate entry. Public (proxy allows /login). */
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Weaver</h1>
        <p className="mt-1 text-sm text-muted">Enter the passcode to continue.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
