"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { buttonClass, ErrorText, Field, inputClass, NoAccess, PageHeader, secondaryButtonClass } from "@/components/ui";
import { api, apiPatch, apiPost } from "@/lib/api";
import { dayKey } from "@/lib/crm";
import { Holiday } from "@/lib/hr";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function HolidayForm({ holiday, onDone, onCancel }: { holiday?: Holiday; onDone: () => void; onCancel?: () => void }) {
  const [date, setDate] = useState(holiday?.date ?? dayKey(new Date()));
  const [name, setName] = useState(holiday?.name ?? "");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() => (holiday ? apiPatch(`/holidays/${holiday.id}`, { date, name }) : apiPost("/holidays", { date, name })));
    if (ok) {
      if (!holiday) setName("");
      onDone();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <Field label="Date">
          <input className={inputClass} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Name">
          <input className={inputClass} required minLength={2} placeholder="e.g. Deepavali" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass} disabled={busy}>
            {holiday ? "Save" : "Add holiday"}
          </button>
          {onCancel && (
            <button type="button" className={secondaryButtonClass} onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

/** Company holidays (#16). Everyone sees them; holidays.manage can change them. */
export default function HolidaysPage() {
  const { can } = useAuth();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data, error, reload } = useApi<Holiday[]>(can(TAGS.LEAVE_READ) ? `/holidays?year=${year}` : null);
  const action = useAction();
  const [today] = useState(() => dayKey(new Date()));
  if (!can(TAGS.LEAVE_READ)) return <NoAccess tag={TAGS.LEAVE_READ} />;
  const canManage = can(TAGS.HOLIDAYS_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company holidays"
        action={
          <div className="flex items-center gap-2">
            <button className={`${secondaryButtonClass} py-1`} onClick={() => setYear(year - 1)} aria-label="Previous year">
              ←
            </button>
            <span className="font-medium">{year}</span>
            <button className={`${secondaryButtonClass} py-1`} onClick={() => setYear(year + 1)} aria-label="Next year">
              →
            </button>
          </div>
        }
      />
      {canManage && (
        <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
          <HolidayForm onDone={reload} />
          <p className="mt-2 text-xs text-neutral-500">
            Leave and LOP day counts are worked out from the holiday list, so changes apply to them straight away.
          </p>
        </section>
      )}
      <ErrorText error={error ?? action.error} />
      {data?.length === 0 && <p className="text-sm text-neutral-500">No holidays listed for {year}.</p>}
      <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
        {data?.map((h) => (
          <li key={h.id} className={`py-2 ${h.date < today ? "text-neutral-400" : ""}`}>
            {editingId === h.id ? (
              <HolidayForm
                holiday={h}
                onCancel={() => setEditingId(null)}
                onDone={() => {
                  setEditingId(null);
                  reload();
                }}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-32 font-medium">{weekday.format(new Date(`${h.date}T00:00:00Z`))}</span>
                <span>{h.name}</span>
                {canManage && (
                  <div className="ml-auto flex gap-3 text-xs">
                    <button className="underline" onClick={() => setEditingId(h.id)}>
                      Edit
                    </button>
                    <button
                      className="text-red-600 underline"
                      onClick={async () => {
                        if (!confirm(`Remove ${h.name}?`)) return;
                        if (await action.run(() => api(`/holidays/${h.id}`, { method: "DELETE" }))) reload();
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
