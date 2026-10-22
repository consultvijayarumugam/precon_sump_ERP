"use client";

import { Boxes, CalendarDays, HardHat, Wrench } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ErrorText,
  InstallationStatusBadge,
  JobStatusBadge,
  OverdueTag,
  panelClass,
  PriorityBadge,
  secondaryButtonCompactClass,
} from "@/components/ui";
import { queryString } from "@/lib/api";
import { formatDateTime } from "@/lib/crm";
import { formatDateOnly, Product } from "@/lib/finance";
import { MODULES } from "@/lib/modules";
import { Installation, JOB_TYPE_LABELS, ServiceJob } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";
import {
  EmptyNote,
  Greeting,
  KpiRow,
  KpiTile,
  LowStockPanel,
  PermissionTagsFooter,
  SectionHeader,
  useDayRanges,
} from "./shared";

const dayHeading = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

/** Installations from today to a week out (not yet completed), grouped by day. */
function InstallationsWeek({ data, todayKey }: { data: Installation[]; todayKey: string }) {
  const pending = data.filter((i) => i.status !== "COMPLETED" || i.scheduledDate === todayKey);
  if (pending.length === 0) return <EmptyNote>No installations in the next 7 days.</EmptyNote>;
  const byDay = new Map<string, Installation[]>();
  for (const i of pending) byDay.set(i.scheduledDate, [...(byDay.get(i.scheduledDate) ?? []), i]);

  return (
    <div className={`${panelClass} divide-y divide-neutral-100 dark:divide-neutral-800`}>
      {[...byDay.entries()].map(([day, items]) => (
        <div key={day} className="px-4 py-3">
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${MODULES.operations.text}`}>
            {day === todayKey ? "Today" : dayHeading.format(new Date(`${day}T00:00:00Z`))}
          </p>
          <ul className="space-y-2.5 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/installations/${i.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                    {i.salesOrder.customerName}
                  </Link>
                  <span className="text-neutral-500">
                    {" "}
                    · {i.salesOrder.product.name} × {i.salesOrder.quantity}
                  </span>
                  <div className="truncate text-xs text-neutral-500">
                    📍 {i.siteAddress}
                    {i.teamName && ` · ${i.teamName}`}
                    {i.assignedTo && ` · ${i.assignedTo.fullName}`}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  {i.isLate && <OverdueTag />}
                  <InstallationStatusBadge status={i.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Open and in-progress service jobs, most urgent first. */
function OpenServiceJobs({ jobs }: { jobs: ServiceJob[] }) {
  const [now] = useState(() => Date.now());
  const open = jobs.filter((j) => j.status !== "RESOLVED").slice(0, 6);
  if (open.length === 0) return <EmptyNote>No open service jobs. ✅</EmptyNote>;
  return (
    <ul className={`${panelClass} divide-y divide-neutral-100 text-sm dark:divide-neutral-800`}>
      {open.map((j) => {
        const overdue = j.nextFollowUpAt && new Date(j.nextFollowUpAt).getTime() < now;
        return (
          <li key={j.id} className={`px-4 py-3 ${overdue ? "bg-red-50/70 dark:bg-red-950/30" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/service/${j.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                {j.jobNumberLabel} · {j.customer.name}
              </Link>
              <PriorityBadge priority={j.priority} />
              <JobStatusBadge status={j.status} />
            </div>
            <div className="mt-0.5 truncate text-xs text-neutral-500">
              {JOB_TYPE_LABELS[j.type]}: {j.description}
            </div>
            <div className="mt-0.5 text-xs text-neutral-500">
              {j.assignedTo?.fullName ?? "Unassigned"}
              {j.nextFollowUpAt && (
                <>
                  {" · next follow-up "}
                  <span className={overdue ? "font-semibold text-red-600 dark:text-red-400" : ""}>
                    {formatDateTime(j.nextFollowUpAt)}
                    {overdue && " (overdue)"}
                  </span>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * FACTORY SUPERVISOR: installations today and this week (with status and
 * site), open service work, and stock that's running low. No CRM, no money.
 */
export function SupervisorDashboard() {
  const { can } = useAuth();
  const { todayKey, weekEndKey } = useDayRanges();
  const [onlyMine, setOnlyMine] = useState(true);

  const installs = useApi<Installation[]>(
    can(TAGS.INSTALLATIONS_READ)
      ? `/installations${queryString({ from: todayKey, to: weekEndKey, assignedTo: onlyMine ? "me" : undefined })}`
      : null,
  );
  const jobs = useApi<ServiceJob[]>(can(TAGS.SERVICE_READ) ? "/service-jobs" : null);
  const stock = useApi<{ lowCount: number; items: Product[] }>(can(TAGS.STOCK_READ) ? "/stock" : null);

  const today = installs.data?.filter((i) => i.scheduledDate === todayKey) ?? [];
  const thisWeek = installs.data?.filter((i) => i.status !== "COMPLETED") ?? [];
  const openJobs = jobs.data?.filter((j) => j.status !== "RESOLVED") ?? [];
  const urgentJobs = openJobs.filter((j) => j.priority === "URGENT" || j.priority === "HIGH").length;

  return (
    <div className="space-y-8">
      <Greeting subtitle="Installations, service work and stock for the factory floor" />

      <ErrorText error={installs.error ?? jobs.error ?? stock.error} />
      <KpiRow>
        {can(TAGS.INSTALLATIONS_READ) && (
          <>
            <KpiTile
              label={onlyMine ? "My installations today" : "Installations today"}
              value={installs.data ? today.length : null}
              href="/installations"
              icon={HardHat}
              module="operations"
            />
            <KpiTile
              label={onlyMine ? "My installations this week" : "Installations this week"}
              value={installs.data ? thisWeek.length : null}
              hint="Not yet completed"
              href="/installations"
              icon={CalendarDays}
              module="operations"
            />
          </>
        )}
        {can(TAGS.SERVICE_READ) && (
          <KpiTile
            label="Open service jobs"
            value={jobs.data ? openJobs.length : null}
            hint={jobs.data && `${urgentJobs} urgent or high priority`}
            href="/service"
            icon={Wrench}
            module="operations"
            alert={urgentJobs > 0}
          />
        )}
        {can(TAGS.STOCK_READ) && (
          <KpiTile
            label="Products low on stock"
            value={stock.data?.lowCount}
            hint={stock.data && stock.data.lowCount === 0 ? "All above alert levels" : undefined}
            href="/stock"
            icon={Boxes}
            module="operations"
            alert={(stock.data?.lowCount ?? 0) > 0}
          />
        )}
      </KpiRow>

      <div className="grid gap-6 xl:grid-cols-5">
        {can(TAGS.INSTALLATIONS_READ) && (
          <section className="xl:col-span-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <span className={`size-2.5 rounded-full ${MODULES.operations.dot}`} aria-hidden />
                Installations: today &amp; next 7 days
              </h2>
              <div className="flex gap-1.5" role="group" aria-label="Whose installations">
                {[
                  { mine: true, label: "Assigned to me" },
                  { mine: false, label: "Everyone" },
                ].map((o) => (
                  <button
                    key={o.label}
                    onClick={() => setOnlyMine(o.mine)}
                    aria-pressed={onlyMine === o.mine}
                    className={`${secondaryButtonCompactClass} ${onlyMine === o.mine ? "border-brand-300 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200" : ""}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {installs.data ? <InstallationsWeek data={installs.data} todayKey={todayKey} /> : <EmptyNote>Loading…</EmptyNote>}
            <p className="mt-2 text-xs text-neutral-500">
              Showing {formatDateOnly(todayKey)} to {formatDateOnly(weekEndKey)}.{" "}
              <Link href="/installations" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                Full calendar →
              </Link>
            </p>
          </section>
        )}
        <section className="space-y-6 xl:col-span-2">
          {can(TAGS.SERVICE_READ) && (
            <div>
              <SectionHeader title="Open service jobs" module="operations" href="/service" />
              {jobs.data ? <OpenServiceJobs jobs={jobs.data} /> : <EmptyNote>Loading…</EmptyNote>}
            </div>
          )}
          {can(TAGS.STOCK_READ) && (
            <div>
              <SectionHeader title="Low stock" module="operations" href="/stock" linkLabel="Stock" />
              <LowStockPanel enabled />
            </div>
          )}
        </section>
      </div>
      <PermissionTagsFooter />
    </div>
  );
}
