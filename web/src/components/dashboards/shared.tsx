"use client";

// Building blocks shared by the role dashboards. Every data hook here takes a
// path or null; callers pass null when the user lacks the tag, so a dashboard
// never asks the API for something the role can't see.
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ReactNode, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { FollowUpItem } from "@/components/follow-up-item";
import { ErrorText, panelClass, StatusBadge } from "@/components/ui";
import { queryString } from "@/lib/api";
import { CrmSummary, dayKey, FollowUpWithLead, formatTime, LEAD_STATUSES } from "@/lib/crm";
import { Product } from "@/lib/finance";
import { MODULES, ModuleKey } from "@/lib/modules";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

const longDate = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const weekdayShort = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** Time-of-day greeting with the date and a one-line role summary. */
export function Greeting({ subtitle }: { subtitle: ReactNode }) {
  const { user } = useAuth();
  const [now] = useState(() => new Date());
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-violet-50 px-6 py-5 shadow-xs dark:border-brand-900 dark:from-brand-950 dark:via-neutral-900 dark:to-violet-950">
      <p className="text-sm font-medium text-brand-700 dark:text-brand-300">{longDate.format(now)}</p>
      <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-neutral-900 dark:text-white">
        {greeting}, {user.fullName.split(" ")[0]} 👋
      </h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
    </section>
  );
}

/**
 * A big number with an icon in the module's colour. `alert` turns it red, but
 * only when there's something to act on (and it says so in words too).
 */
export function KpiTile({
  label,
  value,
  href,
  icon: Icon,
  module,
  alert,
  hint,
}: {
  label: string;
  value: ReactNode;
  href: string;
  icon: LucideIcon;
  module: ModuleKey;
  alert?: boolean;
  hint?: ReactNode;
}) {
  const mod = MODULES[module];
  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-xl border p-4 shadow-xs transition-colors ${
        alert
          ? "border-red-200 bg-red-50 hover:border-red-300 dark:border-red-900 dark:bg-red-950/40"
          : `border-neutral-200 bg-white ${mod.hoverBorder} dark:border-neutral-800 dark:bg-neutral-900`
      }`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${
          alert ? "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300" : mod.chip
        }`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-2xl font-bold tracking-tight tabular-nums sm:text-3xl ${alert ? "text-red-700 dark:text-red-300" : ""}`}>
          {value ?? "–"}
        </span>
        <span className={`block text-sm ${alert ? "font-medium text-red-700 dark:text-red-300" : "text-neutral-600 dark:text-neutral-400"}`}>
          {label}
          {alert && " · needs action"}
        </span>
        {hint && <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>}
      </span>
    </Link>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/** Section heading with an optional module dot and a link on the right. */
export function SectionHeader({ title, module, href, linkLabel }: { title: string; module?: ModuleKey; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        {module && <span className={`size-2.5 rounded-full ${MODULES[module].dot}`} aria-hidden />}
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
          {linkLabel ?? "View all"} →
        </Link>
      )}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={`${panelClass} px-4 py-6 text-center text-sm text-neutral-500`}>{children}</p>;
}

/** Lead counts by stage, each linking to the filtered list. */
export function PipelineStrip({ summary }: { summary: CrmSummary }) {
  return (
    <div className={`${panelClass} flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm`}>
      <span className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${MODULES.crm.text}`}>
        <span className={`size-2 rounded-full ${MODULES.crm.dot}`} aria-hidden />
        Pipeline
      </span>
      {LEAD_STATUSES.map((st) => (
        <Link
          key={st}
          href={st === "WON" ? "/leads/won" : `/leads?status=${st}`}
          className="flex items-center gap-2 hover:text-brand-700 dark:hover:text-brand-300"
        >
          <StatusBadge status={st} />
          <span className="font-semibold tabular-nums">{summary.leadsByStatus[st]}</span>
        </Link>
      ))}
    </div>
  );
}

/** Today's end and a week from now, in local time, for follow-up queries. */
export function useDayRanges() {
  const [ranges] = useState(() => {
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(24, 0, 0, 0);
    const endOfWeek = new Date(endOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    return { now, endOfToday, endOfWeek, todayKey: dayKey(now), weekEndKey: dayKey(new Date(endOfWeek.getTime() - 1)) };
  });
  return ranges;
}

/**
 * Pending follow-ups due by the end of today (overdue ones included, in red).
 * `onlyMine` narrows to the user's own leads when they can see everyone's.
 */
export function useFollowUpsDue(enabled: boolean) {
  const { can } = useAuth();
  const { endOfToday } = useDayRanges();
  return useApi<FollowUpWithLead[]>(
    enabled
      ? `/follow-ups${queryString({
          state: "pending",
          to: endOfToday.toISOString(),
          assignedTo: can(TAGS.LEADS_READ_ALL) ? "me" : undefined,
        })}`
      : null,
  );
}

export function FollowUpsDueList({
  data,
  error,
  onChange,
  emptyText = "Nothing due today. 🎉",
}: {
  data: FollowUpWithLead[] | null;
  error: string | null;
  onChange: () => void;
  emptyText?: string;
}) {
  if (error) return <ErrorText error={error} />;
  if (!data) return <EmptyNote>Loading…</EmptyNote>;
  if (data.length === 0) return <EmptyNote>{emptyText}</EmptyNote>;
  return (
    <ul className="space-y-2">
      {data.map((f) => (
        <FollowUpItem key={f.id} followUp={f} onChange={onChange} />
      ))}
    </ul>
  );
}

/** Upcoming follow-ups from now until a week out, grouped by day. */
export function WeekAhead({ enabled }: { enabled: boolean }) {
  const { can } = useAuth();
  const { now, endOfWeek } = useDayRanges();
  const { data, error } = useApi<FollowUpWithLead[]>(
    enabled
      ? `/follow-ups${queryString({
          state: "upcoming",
          from: now.toISOString(),
          to: endOfWeek.toISOString(),
          assignedTo: can(TAGS.LEADS_READ_ALL) ? "me" : undefined,
        })}`
      : null,
  );
  if (error) return <ErrorText error={error} />;
  if (!data) return <EmptyNote>Loading…</EmptyNote>;
  if (data.length === 0) return <EmptyNote>No follow-ups planned for the next 7 days.</EmptyNote>;

  const byDay = new Map<string, FollowUpWithLead[]>();
  for (const f of data) {
    const key = dayKey(new Date(f.scheduledAt));
    byDay.set(key, [...(byDay.get(key) ?? []), f]);
  }
  return (
    <div className={`${panelClass} divide-y divide-neutral-100 dark:divide-neutral-800`}>
      {[...byDay.entries()].map(([day, items]) => (
        <div key={day} className="px-4 py-3">
          <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wider ${MODULES.crm.text}`}>
            {weekdayShort.format(new Date(`${day}T00:00`))}
          </p>
          <ul className="space-y-1.5 text-sm">
            {items.map((f) => (
              <li key={f.id} className="flex items-baseline gap-3">
                <span className="w-16 shrink-0 tabular-nums text-neutral-500">{formatTime(f.scheduledAt)}</span>
                <span className="min-w-0">
                  <Link href={`/leads/${f.lead.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                    {f.lead.name}
                  </Link>
                  {f.note && <span className="text-neutral-500"> · {f.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Products at or below their alert level (or "all fine"). */
export function LowStockPanel({ enabled, showAll }: { enabled: boolean; showAll?: boolean }) {
  const { data, error } = useApi<{ lowCount: number; items: Product[] }>(enabled ? "/stock" : null);
  if (error) return <ErrorText error={error} />;
  if (!data) return <EmptyNote>Loading…</EmptyNote>;
  const items = showAll ? data.items : data.items.filter((p) => p.isLow);
  if (items.length === 0) return <EmptyNote>All finished goods are above their alert levels. ✅</EmptyNote>;
  return (
    <ul className={`${panelClass} divide-y divide-neutral-100 text-sm dark:divide-neutral-800`}>
      {items.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className={p.isLow ? "font-medium text-red-700 dark:text-red-300" : ""}>{p.name}</span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className={`font-semibold tabular-nums ${p.isLow ? "text-red-700 dark:text-red-300" : ""}`}>
              {p.quantityOnHand} {p.unit}
            </span>
            <span className="text-xs text-neutral-500">alert at {p.lowStockThreshold}</span>
            {p.isLow && <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">Low</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The user's permission tags, tucked away at the bottom. */
export function PermissionTagsFooter() {
  const { user } = useAuth();
  return (
    <details className="text-xs text-neutral-500">
      <summary className="cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-300">
        Your permission tags ({user.permissions.length})
      </summary>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {user.permissions.map((p) => (
          <code key={p} className="rounded bg-neutral-200/60 px-1.5 py-0.5 dark:bg-neutral-800">
            {p}
          </code>
        ))}
      </div>
    </details>
  );
}

/** For a CRM summary query gated on leads.read. */
export function useCrmSummary(enabled: boolean) {
  return useApi<CrmSummary>(enabled ? "/leads/summary" : null);
}
