"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
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
    <main className="flex flex-1 items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-300 p-6 dark:border-neutral-700"
      >
        <div>
          <h1 className="text-xl font-semibold">Precon ERP</h1>
          <p className="text-sm text-neutral-500">Sign in to continue</p>
        </div>

        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
          />
        </label>

        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
