"use client";

import { ReactNode } from "react";
import { secondaryButtonClass } from "@/components/ui";
import { dayKey } from "@/lib/crm";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthTitle = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

export type CalendarTone = "default" | "alert" | "done";

export interface CalendarEntry {
  id: string;
  /** "YYYY-MM-DD" */
  day: string;
  label: string;
  tone: CalendarTone;
}

const TONE_CLASSES: Record<CalendarTone, string> = {
  default: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  alert: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  done: "bg-neutral-100 text-neutral-500 line-through dark:bg-neutral-900",
};

/** Monday-first grid for `month`, padded with days from the months either side. */
export function monthGridDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((lead + last) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - lead + i));
}

interface Props {
  month: Date;
  onMonthChange: (month: Date) => void;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  entries: CalendarEntry[];
  /** Rendered under the grid for the selected day. */
  children?: ReactNode;
}

/**
 * A month calendar of entries (counts on phones, short labels on wider screens).
 * Click a day to choose it; the page shows that day's details below.
 */
export function MonthCalendar({ month, onMonthChange, selectedDay, onSelectDay, entries, children }: Props) {
  const today = new Date();
  const todayKey = dayKey(today);
  const days = monthGridDays(month);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const shift = (delta: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button className={secondaryButtonClass + " py-1"} onClick={() => shift(-1)} aria-label="Previous month">
          ←
        </button>
        <button
          className={secondaryButtonClass + " py-1"}
          onClick={() => {
            onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1));
            onSelectDay(todayKey);
          }}
        >
          Today
        </button>
        <button className={secondaryButtonClass + " py-1"} onClick={() => shift(1)} aria-label="Next month">
          →
        </button>
        <h2 className="ml-2 font-medium">{monthTitle.format(month)}</h2>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-neutral-200 bg-neutral-200 text-xs dark:border-neutral-800 dark:bg-neutral-800">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-neutral-50 py-1 text-center font-medium text-neutral-500 dark:bg-neutral-900">
            {d}
          </div>
        ))}
        {days.map((date) => {
          const key = dayKey(date);
          const items = byDay.get(key) ?? [];
          const inMonth = date.getMonth() === month.getMonth();
          const countTone: CalendarTone = items.some((i) => i.tone === "alert")
            ? "alert"
            : items.every((i) => i.tone === "done")
              ? "done"
              : "default";
          return (
            <button
              key={key}
              onClick={() => onSelectDay(key)}
              className={`flex min-h-16 flex-col items-stretch gap-0.5 p-1 text-left sm:min-h-24 ${
                key === selectedDay ? "bg-sky-50 ring-2 ring-inset ring-sky-500 dark:bg-sky-950" : "bg-white dark:bg-neutral-950"
              } ${inMonth ? "" : "text-neutral-400"}`}
            >
              <span
                className={`self-start rounded px-1 ${key === todayKey ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}
              >
                {date.getDate()}
              </span>
              {items.length > 0 && (
                <span className={`rounded px-1 no-underline sm:hidden ${TONE_CLASSES[countTone].replace("line-through", "")}`}>
                  {items.length}
                </span>
              )}
              <div className="hidden space-y-0.5 sm:block">
                {items.slice(0, 3).map((e) => (
                  <div key={e.id} className={`truncate rounded px-1 ${TONE_CLASSES[e.tone]}`}>
                    {e.label}
                  </div>
                ))}
                {items.length > 3 && <div className="px-1 text-neutral-500">+{items.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
      {children}
    </>
  );
}
