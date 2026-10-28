"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { useApi } from "@/lib/use-api";

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

/**
 * Green WhatsApp button for a lead. Opens a small picker of the admin's
 * templates; choosing one fills it from the lead on the server, logs it on
 * the lead, and opens WhatsApp (wa.me) with the message typed in. The user
 * still taps Send in WhatsApp.
 */
export function WhatsAppButton({ leadId, label = "WhatsApp", onSent }: { leadId: string; label?: string; onSent?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const templates = useApi<MessageTemplate[]>(open ? "/message-templates" : null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function send(templateId: string | null) {
    setError(null);
    setBusy(templateId ?? "blank");
    // Open the tab now, while the click still counts, so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    try {
      const res = await apiPost<{ url: string }>(`/leads/${leadId}/whatsapp`, templateId ? { templateId } : {});
      if (tab) tab.location.replace(res.url);
      else window.location.assign(res.url);
      setOpen(false);
      onSent?.();
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Could not open WhatsApp");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative inline-block" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 shadow-xs hover:bg-emerald-50 dark:border-emerald-800 dark:bg-neutral-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
      >
        <MessageCircle className="size-4" aria-hidden /> {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        >
          <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Pick a message</p>
          {templates.error && <p className="px-2 py-1 text-sm text-red-600">{templates.error}</p>}
          {!templates.data && !templates.error && <p className="px-2 py-1 text-sm text-neutral-500">Loading…</p>}
          {templates.data?.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              disabled={busy !== null}
              onClick={() => send(t.id)}
              className="block w-full rounded-lg px-2 py-2 text-left hover:bg-emerald-50 disabled:opacity-60 dark:hover:bg-emerald-950/40"
            >
              <span className="block text-sm font-semibold">{busy === t.id ? "Opening WhatsApp…" : t.name}</span>
              <span className="line-clamp-2 block text-xs text-neutral-500">{t.body}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            disabled={busy !== null}
            onClick={() => send(null)}
            className="mt-1 block w-full rounded-lg border-t border-neutral-100 px-2 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {busy === "blank" ? "Opening WhatsApp…" : "Open chat without a message"}
          </button>
          {error && <p className="px-2 pt-1 text-sm font-medium text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
