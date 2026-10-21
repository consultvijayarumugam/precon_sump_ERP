"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { InstallationForm } from "@/components/installation-form";
import { MonthCalendar, monthGridDays } from "@/components/month-calendar";
import {
  buttonClass,
  ErrorText,
  inputBaseClass,
  InstallationStatusBadge,
  NoAccess,
  overdueRowClass,
  OverdueTag,
  PageHeader,
  secondaryButtonCompactClass,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { apiPost, queryString } from "@/lib/api";
import { dayKey } from "@/lib/crm";
import { formatDateOnly } from "@/lib/finance";
import { Installation, INSTALLATION_STATUS_LABELS, INSTALLATION_STATUSES } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

function InstallationRow({ i }: { i: Installation }) {
  return (
    <tr className={i.isLate ? overdueRowClass : ""}>
      <td className={tdClass}>
        <div className="font-medium">{formatDateOnly(i.scheduledDate)}</div>
        {i.isLate && <OverdueTag />}
      </td>
      <td className={tdClass}>
        <Link href={`/installations/${i.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
          {i.salesOrder.customerName}
        </Link>
        <div className="text-xs text-neutral-500">{i.salesOrder.orderNumberLabel}</div>
      </td>
      <td className={tdClass}>
        {i.salesOrder.product.name}
        <div className="text-xs text-neutral-500">
          {i.salesOrder.quantity} {i.salesOrder.product.unit}
        </div>
      </td>
      <td className={tdClass}>{i.siteAddress}</td>
      <td className={tdClass}>
        {i.assignedTo?.fullName ?? <em className="text-neutral-500">Unassigned</em>}
        {i.teamName && <div className="text-xs text-neutral-500">{i.teamName}</div>}
      </td>
      <td className={tdClass}>
        <InstallationStatusBadge status={i.status} />
      </td>
    </tr>
  );
}

/** Installation scheduling (#12): calendar and list. */
export default function InstallationsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [status, setStatus] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(dayKey(today));

  const days = useMemo(() => monthGridDays(month), [month]);
  const range = { from: dayKey(days[0]), to: dayKey(days[days.length - 1]) };
  const canRead = can(TAGS.INSTALLATIONS_READ);
  const path =
    view === "calendar"
      ? `/installations${queryString({ ...range, assignedTo: onlyMine ? "me" : undefined })}`
      : `/installations${queryString({ status, assignedTo: onlyMine ? "me" : undefined })}`;
  const { data, error } = useApi<Installation[]>(canRead ? path : null);

  if (!canRead) return <NoAccess tag={TAGS.INSTALLATIONS_READ} />;

  const selected = (data ?? []).filter((i) => i.scheduledDate === selectedDay);
  const table = (rows: Installation[]) => (
    <div className={tableWrapClass}>
      <table className={tableClass}>
        <thead className={theadClass}>
          <tr>
            <th className={thClass}>Date</th>
            <th className={thClass}>Customer</th>
            <th className={thClass}>Product</th>
            <th className={thClass}>Site</th>
            <th className={thClass}>Assigned</th>
            <th className={thClass}>Status</th>
          </tr>
        </thead>
        <tbody className={tbodyClass}>
          {rows.map((i) => (
            <InstallationRow key={i.id} i={i} />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Installations"
        action={
          can(TAGS.INSTALLATIONS_WRITE) &&
          !scheduling && (
            <button className={buttonClass} onClick={() => setScheduling(true)}>
              Schedule installation
            </button>
          )
        }
      />
      {scheduling && (
        <div className="mb-6">
          <InstallationForm
            submitLabel="Schedule"
            onCancel={() => setScheduling(false)}
            onSubmit={async (values) => {
              const created = await apiPost<Installation>("/installations", values);
              router.push(`/installations/${created.id}`);
            }}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["calendar", "list"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`${secondaryButtonCompactClass} ${view === v ? "bg-neutral-200 dark:bg-neutral-800" : ""}`}
          >
            {v === "calendar" ? "Calendar" : "List"}
          </button>
        ))}
        {view === "list" && (
          <select className={inputBaseClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {INSTALLATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INSTALLATION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Only assigned to me
        </label>
      </div>
      <ErrorText error={error} />

      {view === "calendar" ? (
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          entries={(data ?? []).map((i) => ({
            id: i.id,
            day: i.scheduledDate,
            label: i.salesOrder.customerName,
            tone: i.status === "COMPLETED" ? "done" : i.isLate ? "alert" : "default",
          }))}
        >
          <section className="mt-6">
            <h2 className="mb-2 font-medium">{formatDateOnly(selectedDay)}</h2>
            {selected.length === 0 ? (
              <p className="text-sm text-neutral-500">No installations on this day.</p>
            ) : (
              table(selected)
            )}
          </section>
        </MonthCalendar>
      ) : data && data.length === 0 ? (
        <p className="text-sm text-neutral-500">No installations.</p>
      ) : (
        data && table(data)
      )}
    </>
  );
}
