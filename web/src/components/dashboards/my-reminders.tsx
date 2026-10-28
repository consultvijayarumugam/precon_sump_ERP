"use client";

import { BellRing } from "lucide-react";
import Link from "next/link";
import { panelClass } from "@/components/ui";
import { formatTime } from "@/lib/crm";
import { useApi } from "@/lib/use-api";

interface Summary {
  overdue: { id: string; scheduledAt: string; note: string | null; lead: { id: string; name: string; phone: string } }[];
  dueToday: { id: string; scheduledAt: string; note: string | null; lead: { id: string; name: string; phone: string } }[];
  assignedToday: number;
  handedToday: number;
}

/** The daily "my reminders" card: what's overdue and due today, and what's new for you today. */
export function MyReminders() {
  const { data } = useApi<Summary>("/notifications/summary");
  if (!data) return null;
  const nothing = data.overdue.length + data.dueToday.length + data.assignedToday + data.handedToday === 0;
  const items = [...data.overdue.map((f) => ({ ...f, late: true })), ...data.dueToday.map((f) => ({ ...f, late: false }))];

  return (
    <section className={`${panelClass} p-4`} aria-label="My reminders today">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 font-bold">
          <BellRing className="size-4 text-brand-600" aria-hidden /> My reminders today
        </h2>
        {nothing ? (
          <span className="text-sm text-neutral-500">Nothing due. You&apos;re all caught up.</span>
        ) : (
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className={data.overdue.length ? "font-semibold text-red-700 dark:text-red-300" : "text-neutral-500"}>{data.overdue.length} overdue</span>
            <span className={data.dueToday.length ? "font-semibold text-amber-700 dark:text-amber-300" : "text-neutral-500"}>
              {data.dueToday.length} due later today
            </span>
            {data.assignedToday > 0 && <span className="text-neutral-700 dark:text-neutral-300">{data.assignedToday} new leads assigned to you</span>}
            {data.handedToday > 0 && <span className="text-emerald-700 dark:text-emerald-300">{data.handedToday} handed to you by telecallers</span>}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.slice(0, 8).map((f) => (
            <li key={f.id}>
              <Link
                href={`/leads/${f.lead.id}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                  f.late
                    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                    : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                }`}
              >
                <span className="font-semibold">{f.lead.name}</span>
                <span className="text-xs">{f.late ? "overdue" : formatTime(f.scheduledAt)}</span>
              </Link>
            </li>
          ))}
          {items.length > 8 && <li className="self-center text-sm text-neutral-500">+{items.length - 8} more</li>}
        </ul>
      )}
    </section>
  );
}
