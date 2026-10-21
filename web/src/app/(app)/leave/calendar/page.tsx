"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CalendarEntry, MonthCalendar, monthGridDays } from "@/components/month-calendar";
import { ErrorText, NoAccess, PageHeader } from "@/components/ui";
import { dayKey } from "@/lib/crm";
import { formatDateOnly } from "@/lib/finance";
import { LEAVE_TYPE_LABELS, TeamCalendar } from "@/lib/hr";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

/** Leave and holidays calendar (#16): company holidays and who is on leave, for everyone. */
export default function TeamCalendarPage() {
  const { can } = useAuth();
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(dayKey(today));
  const days = useMemo(() => monthGridDays(month), [month]);
  const { data, error } = useApi<TeamCalendar>(
    can(TAGS.LEAVE_READ) ? `/leave/calendar?from=${dayKey(days[0])}&to=${dayKey(days[days.length - 1])}` : null,
  );
  if (!can(TAGS.LEAVE_READ)) return <NoAccess tag={TAGS.LEAVE_READ} />;

  const entries: CalendarEntry[] = [
    ...(data?.holidays ?? []).map((h) => ({ id: `h-${h.date}`, day: h.date, label: `🎉 ${h.name}`, tone: "holiday" as const })),
    ...(data?.leave ?? []).flatMap((l) =>
      l.workingDates.map((d) => ({
        id: `${l.id}-${d}`,
        day: d,
        label: `${l.user.fullName}${l.status === "PENDING" ? " (pending)" : ""}`,
        tone: l.status === "PENDING" ? ("done" as const) : ("default" as const),
      })),
    ),
  ];
  const holiday = data?.holidays.find((h) => h.date === selectedDay);
  const off = (data?.leave ?? []).filter((l) => l.workingDates.includes(selectedDay));

  return (
    <>
      <PageHeader title="Team leave & holidays" />
      <p className="mb-4 text-sm text-neutral-500">
        Company holidays and approved leave for everyone.
        {can(TAGS.LEAVE_APPROVE) ? " As an approver you also see pending requests (struck through)." : ""}
      </p>
      <ErrorText error={error} />
      <MonthCalendar month={month} onMonthChange={setMonth} selectedDay={selectedDay} onSelectDay={setSelectedDay} entries={entries}>
        <section className="mt-6">
          <h2 className="mb-2 font-medium">{formatDateOnly(selectedDay)}</h2>
          {holiday && (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm dark:border-amber-900 dark:bg-amber-950/40">
              Company holiday: <strong>{holiday.name}</strong>
            </p>
          )}
          {off.length === 0 ? (
            !holiday && <p className="text-sm text-neutral-500">Nobody is on leave.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {off.map((l) => (
                <li key={l.id} className="flex flex-wrap gap-2">
                  <span className="font-medium">{l.user.fullName}</span>
                  <span className="text-neutral-500">
                    {formatDateOnly(l.startDate)}
                    {l.endDate !== l.startDate && ` – ${formatDateOnly(l.endDate)}`}
                    {l.type && ` · ${LEAVE_TYPE_LABELS[l.type]}`}
                    {l.status === "PENDING" && " · pending"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </MonthCalendar>
    </>
  );
}
