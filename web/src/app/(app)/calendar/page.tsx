"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { FollowUpItem } from "@/components/follow-up-item";
import {
  ErrorText,
  NoAccess,
  PageHeader,
  secondaryButtonCompactClass,
} from "@/components/ui";
import { queryString } from "@/lib/api";
import { dayKey, FollowUpWithLead, formatTime, isOverdue, TAGS } from "@/lib/crm";
import { useApi } from "@/lib/use-api";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthTitle = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const dayTitle = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" });

/** All cells for a Monday-first month grid, padded with days from adjacent months. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // back to Monday
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells = Math.ceil(((first.getDay() + 6) % 7 + last.getDate()) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** Calendar of follow-ups (#17). Defaults to the logged-in user's own leads. */
export default function CalendarPage() {
  const { can } = useAuth();
  const canSeeAll = can(TAGS.LEADS_READ_ALL);
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(dayKey(today));
  const [everyone, setEveryone] = useState(false);

  const days = useMemo(() => monthGrid(month), [month]);
  const rangeStart = days[0];
  const rangeEnd = new Date(days[days.length - 1].getFullYear(), days[days.length - 1].getMonth(), days[days.length - 1].getDate() + 1);

  const { data, error, reload } = useApi<FollowUpWithLead[]>(
    can(TAGS.LEADS_READ)
      ? `/follow-ups${queryString({
          from: rangeStart.toISOString(),
          to: rangeEnd.toISOString(),
          assignedTo: canSeeAll && everyone ? undefined : "me",
        })}`
      : null,
  );

  const byDay = useMemo(() => {
    const map = new Map<string, FollowUpWithLead[]>();
    for (const f of data ?? []) {
      const key = dayKey(new Date(f.scheduledAt));
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return map;
  }, [data]);

  if (!can(TAGS.LEADS_READ)) return <NoAccess tag={TAGS.LEADS_READ} />;

  const shiftMonth = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const selected = byDay.get(selectedDay) ?? [];
  const todayKey = dayKey(today);

  return (
    <>
      <PageHeader
        title="Follow-up calendar"
        action={
          canSeeAll && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
              Show everyone&apos;s follow-ups
            </label>
          )
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <button className={secondaryButtonCompactClass} onClick={() => shiftMonth(-1)} aria-label="Previous month">
          ←
        </button>
        <button
          className={secondaryButtonCompactClass}
          onClick={() => {
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelectedDay(todayKey);
          }}
        >
          Today
        </button>
        <button className={secondaryButtonCompactClass} onClick={() => shiftMonth(1)} aria-label="Next month">
          →
        </button>
        <h2 className="ml-2 font-medium">{monthTitle.format(month)}</h2>
      </div>

      <ErrorText error={error} />

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border shadow-xs border-neutral-200 bg-neutral-200 text-xs dark:border-neutral-800 dark:bg-neutral-800">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-neutral-50 py-1 text-center font-medium text-neutral-500 dark:bg-neutral-900">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = dayKey(day);
          const items = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const hasOverdue = items.some(isOverdue);
          return (
            <button
              key={key}
              onClick={() => setSelectedDay(key)}
              className={`flex min-h-16 flex-col items-stretch gap-0.5 p-1 text-left sm:min-h-24 ${
                key === selectedDay ? "bg-sky-50 ring-2 ring-inset ring-sky-500 dark:bg-sky-950" : "bg-white dark:bg-neutral-950"
              } ${inMonth ? "" : "text-neutral-400"}`}
            >
              <span
                className={`self-start rounded px-1 ${key === todayKey ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}
              >
                {day.getDate()}
              </span>
              {/* Phones: a count. Wider screens: the first few entries. */}
              {items.length > 0 && (
                <span
                  className={`rounded px-1 sm:hidden ${
                    hasOverdue
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : items.every((f) => f.completedAt)
                        ? "bg-neutral-100 text-neutral-500 dark:bg-neutral-900"
                        : "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200"
                  }`}
                >
                  {items.length}
                </span>
              )}
              <div className="hidden space-y-0.5 sm:block">
                {items.slice(0, 3).map((f) => (
                  <div
                    key={f.id}
                    className={`truncate rounded px-1 ${
                      f.completedAt
                        ? "bg-neutral-100 text-neutral-500 line-through dark:bg-neutral-900"
                        : isOverdue(f)
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200"
                    }`}
                  >
                    {formatTime(f.scheduledAt)} {f.lead.name}
                  </div>
                ))}
                {items.length > 3 && <div className="px-1 text-neutral-500">+{items.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 font-medium">{dayTitle.format(new Date(`${selectedDay}T00:00`))}</h2>
        {selected.length === 0 ? (
          <p className="text-sm text-neutral-500">No follow-ups on this day.</p>
        ) : (
          <ul className="space-y-2">
            {selected.map((f) => (
              <FollowUpItem key={f.id} followUp={f} onChange={reload} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
