"use client";

import { FileText, Image as ImageIcon, MessageCircle, Paperclip } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { AnchoredPanel } from "@/components/anchored-panel";
import type { ContactVariant } from "@/components/call-button";
import { apiPost } from "@/lib/api";
import { fileTypeLabel, LibraryFile } from "@/lib/files";
import { useApi } from "@/lib/use-api";

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

const WA_LOOK: Record<ContactVariant, string> = {
  icon: "size-11 lg:size-9",
  inline: "h-11 px-3 text-sm font-semibold",
  block: "h-12 w-full px-3 text-sm font-semibold sm:h-10 sm:w-auto",
};

/**
 * Green WhatsApp button for a lead. Opens a small picker of the admin's
 * templates; choosing one fills it from the lead on the server, logs it on
 * the lead, and opens WhatsApp (wa.me) with the message typed in. The user
 * still taps Send in WhatsApp. Ticked library files are added to the message
 * as links (wa.me can't carry real attachments) and logged on the lead.
 */
export function WhatsAppButton({
  leadId,
  name,
  label = "WhatsApp",
  variant = "inline",
  onSent,
}: {
  leadId: string;
  /** Whose lead this is, for the icon-only button's screen-reader label. */
  name?: string;
  label?: string;
  variant?: ContactVariant;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const templates = useApi<MessageTemplate[]>(open ? "/message-templates" : null);
  const files = useApi<LibraryFile[]>(open ? "/files" : null);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 5 ? p : [...p, id]));
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  async function send(templateId: string | null) {
    setError(null);
    setBusy(templateId ?? "blank");
    // Open the tab now, while the click still counts, so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    try {
      const res = await apiPost<{ url: string }>(`/leads/${leadId}/whatsapp`, {
        ...(templateId ? { templateId } : {}),
        ...(picked.length ? { fileIds: picked } : {}),
      });
      if (tab) tab.location.replace(res.url);
      else window.location.assign(res.url);
      setOpen(false);
      setPicked([]);
      onSent?.();
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Could not open WhatsApp");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={variant === "icon" ? `WhatsApp ${name ?? "this lead"}` : undefined}
        title={variant === "icon" ? "WhatsApp" : undefined}
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white text-emerald-700 shadow-xs hover:bg-emerald-50 dark:border-emerald-800 dark:bg-neutral-900 dark:text-emerald-300 dark:hover:bg-emerald-950 ${WA_LOOK[variant]}`}
      >
        <MessageCircle className="size-[18px]" aria-hidden /> {variant !== "icon" && label}
      </button>
      {open && (
        <AnchoredPanel anchor={button} label="Send a WhatsApp message" onClose={close}>
          {files.data && files.data.length > 0 && (
            <fieldset className="mb-2 border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <legend className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <Paperclip className="size-3.5" aria-hidden /> Add files (sent as links)
              </legend>
              <div className="max-h-40 overflow-y-auto">
                {files.data.map((f) => {
                  const Icon = f.kind === "pdf" ? FileText : ImageIcon;
                  return (
                    <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800">
                      <input type="checkbox" checked={picked.includes(f.id)} onChange={() => toggle(f.id)} disabled={busy !== null} />
                      <Icon className={`size-4 shrink-0 ${f.kind === "pdf" ? "text-red-600" : "text-[var(--ps-blue-600)]"}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate" title={f.title}>
                        {f.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-neutral-500">
                        {fileTypeLabel(f)} · {f.categoryLabel}
                      </span>
                    </label>
                  );
                })}
              </div>
              {picked.length > 0 && (
                <p className="px-2 pt-1 text-xs text-emerald-700 dark:text-emerald-300">
                  {picked.length} link{picked.length === 1 ? "" : "s"} will be added to the message below.
                </p>
              )}
            </fieldset>
          )}
          {files.error && <p className="px-2 py-1 text-xs text-red-600">Files: {files.error}</p>}
          <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Pick a message</p>
          {templates.error && <p className="px-2 py-1 text-sm text-red-600">{templates.error}</p>}
          {!templates.data && !templates.error && <p className="px-2 py-1 text-sm text-neutral-500">Loading…</p>}
          {templates.data?.map((t) => (
            <button
              key={t.id}
              type="button"
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
            disabled={busy !== null}
            onClick={() => send(null)}
            className="mt-1 block w-full rounded-lg border-t border-neutral-100 px-2 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {busy === "blank" ? "Opening WhatsApp…" : picked.length ? "Send just the file links" : "Open chat without a message"}
          </button>
          {error && <p className="px-2 pt-1 text-sm font-medium text-red-600">{error}</p>}
        </AnchoredPanel>
      )}
    </>
  );
}
