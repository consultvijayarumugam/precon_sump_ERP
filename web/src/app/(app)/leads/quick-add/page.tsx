"use client";

import { CheckCircle2, ExternalLink, MessageCircle, TriangleAlert, Zap } from "lucide-react";
import Link from "next/link";
import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { buttonClass, ErrorText, inputClass, NoAccess, PageHeader, panelClass } from "@/components/ui";
import { apiPost } from "@/lib/api";
import { LeadStatus, STATUS_LABELS, TAGS } from "@/lib/crm";
import { displayPhone } from "@/lib/phone";
import { useApi } from "@/lib/use-api";

type Person = { id: string; fullName: string };

type QuickAddResult =
  | {
      status: "created";
      phone: undefined;
      lead: { id: string; name: string; phone: string };
      assignedTo: Person | null;
      previous: { id: string; name: string; status: LeadStatus } | null;
      addedToday: number;
    }
  | {
      status: "duplicate";
      phone: string;
      existing: { id: string; name: string; status: LeadStatus; assignedTo: Person | null };
      addedToday: number;
    };

interface Today {
  addedByYou: number;
  addedByEveryone: number;
  nextUp: Person | null;
  telecallers: { id: string; fullName: string; inRotation: boolean; leadsToday: number }[];
}

/** One tap into the WhatsApp chat with this number (wa.me wants digits only). */
const whatsAppLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

const linkLook =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2";

function ResultRow({ result, canOpen }: { result: QuickAddResult & { key: number }; canOpen: boolean }) {
  const created = result.status === "created";
  const leadId = created ? result.lead.id : result.existing.id;
  const phone = created ? result.lead.phone : result.phone;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      {created ? (
        <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900 tabular-nums dark:text-neutral-100">
          {displayPhone(phone)}
          {created && !result.lead.name.startsWith("WhatsApp enquiry") && <span className="font-normal text-neutral-500"> · {result.lead.name}</span>}
        </p>
        {created ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {result.assignedTo ? (
              <>
                Added, assigned to <strong className="text-neutral-900 dark:text-neutral-100">{result.assignedTo.fullName}</strong>
              </>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">Added, but not assigned: no telecaller is taking leads right now</span>
            )}
            {result.previous && (
              <span className="text-neutral-500"> · enquired before ({STATUS_LABELS[result.previous.status]})</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Not added: already a lead, <strong>{result.existing.name}</strong> ({STATUS_LABELS[result.existing.status]}
            {result.existing.assignedTo ? `, with ${result.existing.assignedTo.fullName}` : ", unassigned"})
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <a
          href={whatsAppLink(phone)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkLook} bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600`}
        >
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
        </a>
        {canOpen && (
          <Link
            href={`/leads/${leadId}`}
            className={`${linkLook} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800`}
          >
            <ExternalLink className="size-4" aria-hidden /> Open
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * For logging click-to-WhatsApp ad enquiries fast: type or paste the number,
 * press Enter, and the form is ready for the next one. Each lead goes to the
 * next telecaller in turn; a number that's already an open lead is flagged.
 */
export default function QuickAddPage() {
  const { can } = useAuth();
  const allowed = can(TAGS.LEADS_QUICK_ADD);
  const today = useApi<Today>(allowed ? "/leads/quick-add/today" : null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<(QuickAddResult & { key: number })[]>([]);
  const phoneRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  if (!allowed) return <NoAccess tag={TAGS.LEADS_QUICK_ADD} />;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || !phone.trim()) {
      phoneRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<QuickAddResult>("/leads/quick-add", {
        phone,
        name: name.trim() || undefined,
        note: note.trim() || undefined,
      });
      setResults((list) => [{ ...result, key: ++counter.current }, ...list].slice(0, 50));
      setPhone("");
      setName("");
      setNote("");
      today.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the lead");
    } finally {
      setBusy(false);
      phoneRef.current?.focus();
    }
  }

  // Enter adds from any field; Shift+Enter starts a new line in the message.
  const enterSubmits = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const addedByYou = results[0]?.addedToday ?? today.data?.addedByYou;
  const canOpen = can(TAGS.LEADS_READ_ALL);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Quick add"
        subtitle="WhatsApp enquiries. A phone number is all you need: each lead goes to the next telecaller in turn."
        action={
          <div className="rounded-xl bg-[var(--ps-tint-50)] px-4 py-2 text-right">
            <p className="text-2xl font-bold tabular-nums text-[var(--ps-blue-600)]">{addedByYou ?? "–"}</p>
            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">added by you today</p>
          </div>
        }
      />

      <form onSubmit={submit} className={`${panelClass} grid gap-3 p-4 sm:grid-cols-[1fr_1fr] sm:p-5`}>
        <label className="grid gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Phone *
          <input
            ref={phoneRef}
            className={`${inputClass} text-lg tabular-nums`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={enterSubmits}
            placeholder="98765 43210"
            inputMode="tel"
            autoComplete="off"
            autoFocus
            required
            aria-describedby="quick-add-error"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Name <span className="font-normal text-neutral-500">(optional)</span>
          <input className={`${inputClass} text-lg`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={enterSubmits} autoComplete="off" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-neutral-700 sm:col-span-2 dark:text-neutral-300">
          Their first message <span className="font-normal text-neutral-500">(optional, paste it here)</span>
          <textarea
            className={`${inputClass} min-h-[64px]`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={enterSubmits}
            rows={2}
            maxLength={2000}
          />
        </label>
        <div id="quick-add-error" className="sm:col-span-2" aria-live="polite">
          <ErrorText error={error} />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className={buttonClass} disabled={busy}>
            <Zap className="size-4" aria-hidden /> {busy ? "Adding…" : "Add lead"}
          </button>
          <span className="text-xs text-neutral-500">
            Press <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">Enter</kbd> to add and start the next one. With or
            without +91.
          </span>
        </div>
      </form>

      {today.data && today.data.telecallers.length > 0 && (
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400" aria-live="polite">
          <span className="font-semibold text-neutral-800 dark:text-neutral-200">Today&apos;s leads:</span>{" "}
          {today.data.telecallers
            .filter((t) => t.inRotation || t.leadsToday > 0)
            .map((t) => `${t.fullName.split(" ")[0]} ${t.leadsToday}`)
            .join(" · ")}
          {today.data.nextUp && <> · next: {today.data.nextUp.fullName.split(" ")[0]}</>}
        </p>
      )}

      {results.length > 0 && (
        <section className={`${panelClass} mt-4`} aria-label="Added this session">
          <h2 className="border-b border-neutral-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:border-neutral-800">
            This session · {results.filter((r) => r.status === "created").length} added
          </h2>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800" aria-live="polite">
            {results.map((r) => (
              <ResultRow key={r.key} result={r} canOpen={canOpen} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
