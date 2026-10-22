"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { buttonClass, ErrorText, Field, inputClass, panelClass } from "@/components/ui";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gradient-to-b from-brand-950 to-brand-800 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <span className="grid size-10 place-items-center rounded-lg bg-brand-500 shadow-md">
            <svg viewBox="0 0 20 20" className="size-6" aria-hidden>
              <rect x="3" y="3" width="14" height="4" rx="1" fill="white" />
              <rect x="3" y="8.5" width="9" height="4" rx="1" fill="white" opacity="0.85" />
              <rect x="13.5" y="8.5" width="3.5" height="4" rx="1" fill="white" opacity="0.85" />
              <rect x="3" y="14" width="14" height="3" rx="1" fill="white" opacity="0.7" />
            </svg>
          </span>
          <span className="text-2xl tracking-tight">
            <span className="font-semibold">Precon</span> <span className="font-light text-brand-200">ERP</span>
          </span>
        </div>

        <form onSubmit={handleSubmit} className={`${panelClass} space-y-5 p-6 shadow-xl`}>
          <div>
            <h1 className="text-lg font-semibold">Sign in</h1>
            <p className="text-sm text-neutral-500">Use your work email and password.</p>
          </div>
          <Field label="Email">
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <ErrorText error={error} />
          <button type="submit" disabled={submitting} className={`${buttonClass} w-full`}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-brand-200/70">Precon sumps (3,000–20,000 L) · microbes</p>
      </div>
    </main>
  );
}
