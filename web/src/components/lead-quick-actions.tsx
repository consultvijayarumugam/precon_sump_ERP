"use client";

// The telecaller's quick actions, shared by the workbench, the sales dashboard
// and the lead page: log a call, set the next callback, qualify + hand to sales.
import { FormEvent, ReactNode, useState } from "react";
import { buttonSmClass, Field, inputClass, secondaryButtonSmClass } from "@/components/ui";
import { apiPost, apiPut } from "@/lib/api";
import { formatLitres, PRODUCT_LABELS, ProductInterest, SUMP_SIZES_LITRES } from "@/lib/crm";
import { useApi } from "@/lib/use-api";
import {
  CALL_OUTCOME_LABELS,
  CALL_OUTCOMES,
  CallOutcome,
  callbackPresets,
  CLOSING_OUTCOMES,
  toLocalInput,
} from "@/lib/workflow";

const panelClass = "mt-3 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40";

/** Like Field, but a <div>: a <label> around the chip buttons would "click" the first chip. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm" role="group" aria-label={label}>
      <span className="mb-1.5 block font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p> : null;
}

/** Quick-pick chips plus a date-time box. Value is a datetime-local string ("" = none). */
function CallbackPicker({ value, onChange, allowNone }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const [presets] = useState(() => callbackPresets());
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {allowNone && (
          <button type="button" onClick={() => onChange("")} className={chip(value === "")}>
            No callback
          </button>
        )}
        {presets.map((p) => {
          const v = toLocalInput(p.at);
          return (
            <button key={p.label} type="button" onClick={() => onChange(v)} className={chip(value === v)}>
              {p.label}
            </button>
          );
        })}
      </div>
      <input type="datetime-local" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? "border-brand-600 bg-brand-600 text-white"
      : "border-neutral-300 bg-white text-neutral-700 hover:border-brand-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
  }`;

/** Default next callback for an outcome: soon for no answer, tomorrow for "call back". */
function defaultCallbackFor(outcome: CallOutcome | null): string {
  if (!outcome || CLOSING_OUTCOMES.includes(outcome) || outcome === "INTERESTED") return "";
  const [inHour, ...rest] = callbackPresets();
  const tomorrow = rest.find((p) => p.label.startsWith("Tomorrow")) ?? inHour;
  return toLocalInput(outcome === "CALL_BACK" ? tomorrow.at : inHour.at);
}

export function LogCallPanel({
  leadId,
  onDone,
  onCancel,
}: {
  leadId: string;
  /** Called after saving; `interested` lets the caller open Qualify next. */
  onDone: (result: { outcome: CallOutcome; interested: boolean }) => void;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState("");
  const [callback, setCallback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closes = outcome !== null && CLOSING_OUTCOMES.includes(outcome);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!outcome) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/leads/${leadId}/calls`, {
        outcome,
        note: note || undefined,
        nextCallbackAt: !closes && callback ? new Date(callback).toISOString() : undefined,
      });
      onDone({ outcome, interested: outcome === "INTERESTED" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the call");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className={panelClass}>
      <p className="text-sm font-semibold">How did the call go?</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CALL_OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => {
              setOutcome(o);
              setCallback(defaultCallbackFor(o));
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              outcome === o
                ? CLOSING_OUTCOMES.includes(o)
                  ? "border-red-600 bg-red-600 text-white"
                  : o === "INTERESTED"
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-brand-600 bg-brand-600 text-white"
                : "border-neutral-300 bg-white hover:border-brand-400 dark:border-neutral-700 dark:bg-neutral-900"
            }`}
          >
            {CALL_OUTCOME_LABELS[o]}
          </button>
        ))}
      </div>
      {outcome && (
        <>
          <Field label="Note (optional)">
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did they say?" />
          </Field>
          {closes ? (
            <p className="text-sm text-red-700 dark:text-red-300">This closes the lead as Lost; it leaves your list.</p>
          ) : (
            <Group label={outcome === "INTERESTED" ? "Next callback (optional; qualify it next if you can)" : "Next callback"}>
              <CallbackPicker value={callback} onChange={setCallback} allowNone />
            </Group>
          )}
        </>
      )}
      <ErrorLine error={error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonSmClass} disabled={!outcome || busy}>
          {busy ? "Saving…" : "Save call"}
        </button>
        <button type="button" className={secondaryButtonSmClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CallbackPanel({
  leadId,
  current,
  onDone,
  onCancel,
}: {
  leadId: string;
  current: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(() => (current && new Date(current) > new Date() ? toLocalInput(new Date(current)) : toLocalInput(callbackPresets()[0].at)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPut(`/leads/${leadId}/next-callback`, { scheduledAt: new Date(value).toISOString() });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set the callback");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className={panelClass}>
      <p className="text-sm font-semibold">{current ? "Move the next callback" : "Set the next callback"}</p>
      <CallbackPicker value={value} onChange={setValue} />
      <ErrorLine error={error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonSmClass} disabled={!value || busy}>
          {busy ? "Saving…" : "Save callback"}
        </button>
        <button type="button" className={secondaryButtonSmClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface SalesTeam {
  nextUp: { id: string; fullName: string } | null;
  members: { id: string; fullName: string; inRotation: boolean }[];
}

export function QualifyPanel({
  lead,
  onDone,
  onCancel,
}: {
  lead: { id: string; productInterest: ProductInterest | null; sumpSizeLitres: number | null; city: string | null };
  onDone: (handedTo: string) => void;
  onCancel: () => void;
}) {
  const team = useApi<SalesTeam>("/sales-team");
  const [product, setProduct] = useState<ProductInterest | "">(lead.productInterest ?? "");
  const [size, setSize] = useState(lead.sumpSizeLitres ? String(lead.sumpSizeLitres) : "");
  const [city, setCity] = useState(lead.city ?? "");
  const [notes, setNotes] = useState("");
  const [salesUserId, setSalesUserId] = useState(""); // "" = round-robin
  const [followUp, setFollowUp] = useState(() => {
    const tomorrow = callbackPresets().find((p) => p.label.startsWith("Tomorrow"));
    return tomorrow ? toLocalInput(tomorrow.at) : "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ handedTo: { fullName: string } }>(`/leads/${lead.id}/qualify`, {
        productInterest: product,
        sumpSizeLitres: product === "SUMP" && size ? Number(size) : undefined,
        city: city || undefined,
        notes: notes || undefined,
        salesUserId: salesUserId || undefined,
        salesFollowUpAt: followUp ? new Date(followUp).toISOString() : undefined,
      });
      onDone(result.handedTo.fullName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not qualify the lead");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className={`${panelClass} border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20`}>
      <p className="text-sm font-semibold">Qualify and hand to sales</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product *">
          <select className={inputClass} value={product} onChange={(e) => setProduct(e.target.value as ProductInterest | "")} required>
            <option value="">Choose…</option>
            {(["SUMP", "MICROBES"] as ProductInterest[]).map((p) => (
              <option key={p} value={p}>
                {PRODUCT_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        {product === "SUMP" ? (
          <Field label="Sump size">
            <select className={inputClass} value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">Not decided yet</option>
              {SUMP_SIZES_LITRES.map((s) => (
                <option key={s} value={s}>
                  {formatLitres(s)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field label="City">
          <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Erode" />
        </Field>
        <Field label="Hand to">
          <select className={inputClass} value={salesUserId} onChange={(e) => setSalesUserId(e.target.value)}>
            <option value="">
              {team.data?.nextUp ? `Next in turn: ${team.data.nextUp.fullName}` : "Next salesperson in turn"}
            </option>
            {team.data?.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
                {m.inRotation ? "" : " (not taking new leads)"}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes for the salesperson">
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Need, timeline, budget, best time to call" />
      </Field>
      <Group label="When should sales call? (goes on their follow-up list)">
        <CallbackPicker value={followUp} onChange={setFollowUp} allowNone />
      </Group>
      <ErrorLine error={error ?? team.error} />
      <div className="flex gap-2">
        <button type="submit" className={`${buttonSmClass}`} disabled={!product || busy}>
          {busy ? "Handing over…" : "Qualify & hand over"}
        </button>
        <button type="button" className={secondaryButtonSmClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
