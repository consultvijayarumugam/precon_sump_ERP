"use client";

import { CalendarRange, X } from "lucide-react";
import { useState } from "react";
import { ALL_TIME, PRESETS, presetRange, rangeLabel, type DateRange, type PresetKey } from "@/lib/date-range";

export { ALL_TIME, DASHBOARD_PRESETS, presetRange, rangeLabel } from "@/lib/date-range";
export type { DateRange, PresetKey } from "@/lib/date-range";

/**
 * Preset buttons (Today ... All time) plus a custom from/to that overrides
 * them. Shows what's active and how many records match.
 */
export function DateRangeFilter({
  value,
  onChange,
  count,
  noun,
  presets,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  /** How many records match (shown next to the active filter). */
  count?: number;
  /** e.g. ["won lead", "won leads"] */
  noun: [string, string];
  /** Which presets to offer (default: all of them). Without "all", there is no Clear. */
  presets?: PresetKey[];
}) {
  const [from, setFrom] = useState(value.preset === "custom" ? (value.from ?? "") : "");
  const [to, setTo] = useState(value.preset === "custom" ? (value.to ?? "") : "");
  const badRange = Boolean(from && to && to < from);

  function applyCustom(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (nextFrom && nextTo && nextTo < nextFrom) return; // wait for a valid range
    if (!nextFrom && !nextTo) {
      if (!presets || presets.includes("all")) onChange(ALL_TIME);
      return;
    }
    else onChange({ preset: "custom", from: nextFrom || undefined, to: nextTo || undefined });
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-[var(--ps-line)] bg-[var(--ps-card)] p-3 shadow-xs sm:p-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date presets">
          {PRESETS.filter((p) => !presets || presets.includes(p.key)).map((p) => {
            const active = value.preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFrom("");
                  setTo("");
                  onChange(p.key === "all" ? ALL_TIME : presetRange(p.key));
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-[var(--ps-blue-600)] bg-[var(--ps-blue-600)] text-white"
                    : "border-[var(--ps-line)] bg-transparent text-[var(--ps-ink-2)] hover:border-[var(--ps-blue-600)] hover:text-[var(--ps-ink)]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Custom date range">
          <label className="text-xs font-medium text-[var(--ps-ink-3)]">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => applyCustom(e.target.value, to)}
              className="mt-1 block rounded-lg border border-[var(--ps-line)] bg-[var(--ps-card)] px-2 py-1.5 text-sm text-[var(--ps-ink)]"
            />
          </label>
          <label className="text-xs font-medium text-[var(--ps-ink-3)]">
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => applyCustom(from, e.target.value)}
              className="mt-1 block rounded-lg border border-[var(--ps-line)] bg-[var(--ps-card)] px-2 py-1.5 text-sm text-[var(--ps-ink)]"
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--ps-line)] pt-2.5 text-sm" aria-live="polite">
        <CalendarRange className="size-4 text-[var(--ps-blue-600)]" aria-hidden />
        <span className="text-[var(--ps-ink-2)]">
          Showing: <strong className="font-semibold text-[var(--ps-ink)]">{rangeLabel(value)}</strong>
        </span>
        {count !== undefined && (
          <span className="rounded-full bg-[var(--ps-tint-50)] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--ps-blue-600)] dark:text-[var(--ps-mark)]">
            {count.toLocaleString("en-IN")} {count === 1 ? noun[0] : noun[1]}
          </span>
        )}
        {value.preset !== "all" && (!presets || presets.includes("all")) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              onChange(ALL_TIME);
            }}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--ps-blue-600)] hover:underline dark:text-[var(--ps-mark)]"
          >
            <X className="size-3.5" aria-hidden /> Clear (all time)
          </button>
        )}
        {badRange && <span className="w-full text-xs font-medium text-red-600">The &ldquo;to&rdquo; date is before the &ldquo;from&rdquo; date.</span>}
      </div>
    </div>
  );
}
