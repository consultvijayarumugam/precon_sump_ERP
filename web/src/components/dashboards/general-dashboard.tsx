"use client";

import { CalendarClock, Contact, type LucideIcon, TriangleAlert, Trophy } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  FinanceCard,
  HrAdminCard,
  InstallationsCard,
  MyHrCard,
  SalesCard,
  ServiceCard,
  StockCard,
} from "@/components/dashboard-cards";
import { FollowUpItem } from "@/components/follow-up-item";
import { ErrorText, LinkButton, panelClass, StatusBadge } from "@/components/ui";
import { queryString } from "@/lib/api";
import {
  CrmSummary,
  FollowUpWithLead,
  formatDate,
  LEAD_STATUSES,
  LeadListItem,
  Paginated,
  productInterestLabel,
} from "@/lib/crm";
import { MODULES, ModuleKey } from "@/lib/modules";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

function Tile({
  label,
  value,
  href,
  icon: Icon,
  tone,
  module = "crm",
}: {
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  tone?: "alert";
  module?: ModuleKey;
}) {
  const alert = tone === "alert" && value > 0;
  const mod = MODULES[module];
  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-lg border p-4 shadow-xs transition-colors ${
        alert
          ? "border-red-200 bg-red-50 hover:border-red-300 dark:border-red-900 dark:bg-red-950/40"
          : `border-neutral-200 bg-white ${mod.hoverBorder} dark:border-neutral-800 dark:bg-neutral-900`
      }`}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-lg ${
          alert ? "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300" : mod.chip
        }`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span>
        <span className={`block text-3xl font-bold tracking-tight tabular-nums ${alert ? "text-red-700 dark:text-red-300" : ""}`}>
          {value}
        </span>
        <span className={`block text-sm ${alert ? "font-medium text-red-700 dark:text-red-300" : "text-neutral-600 dark:text-neutral-400"}`}>
          {label}
          {alert && " · needs action"}
        </span>
      </span>
    </Link>
  );
}

const longDate = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/**
 * Fallback for a role without a tailored dashboard: shows every card the
 * user's tags allow (the pre-role-dashboard layout).
 */
export function GeneralDashboard() {
  const { user, can } = useAuth();
  const canSeeLeads = can(TAGS.LEADS_READ);
  const hasAnyModule = user.permissions.length > 0;

  // Pending follow-ups due by the end of today (local time), including overdue ones.
  const dueTodayPath = useMemo(() => {
    const endOfToday = new Date();
    endOfToday.setHours(24, 0, 0, 0);
    return `/follow-ups${queryString({ state: "pending", to: endOfToday.toISOString() })}`;
  }, []);

  const summary = useApi<CrmSummary>(canSeeLeads ? "/leads/summary" : null);
  const dueToday = useApi<FollowUpWithLead[]>(canSeeLeads ? dueTodayPath : null);
  const recent = useApi<Paginated<LeadListItem>>(canSeeLeads ? "/leads?pageSize=5" : null);
  const [now] = useState(() => new Date());
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-violet-50 px-6 py-5 shadow-xs dark:border-brand-900 dark:from-brand-950 dark:via-neutral-900 dark:to-violet-950">
        <p className="text-sm font-medium text-brand-700 dark:text-brand-300">{longDate.format(now)}</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-neutral-900 dark:text-white">
          {greeting}, {user.fullName.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {user.role.name} ·{" "}
          {can(TAGS.LEADS_READ_ALL) ? "You can see all leads" : canSeeLeads ? "Showing leads assigned to you" : `Modules: ${user.modules.join(", ") || "none"}`}
        </p>
      </section>

      {canSeeLeads && summary.data && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Open leads" value={summary.data.openLeads} href="/leads" icon={Contact} />
            <Tile label="Won" value={summary.data.leadsByStatus.WON} href="/leads/won" icon={Trophy} />
            <Tile label="Overdue follow-ups" value={summary.data.overdueFollowUps} href="/follow-ups" icon={TriangleAlert} tone="alert" />
            <Tile label="Upcoming follow-ups" value={summary.data.upcomingFollowUps} href="/follow-ups" icon={CalendarClock} module="home" />
          </div>
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
                <span className="font-semibold tabular-nums">{summary.data!.leadsByStatus[st]}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!hasAnyModule && (
        <p className="text-sm text-neutral-500">
          No modules are assigned to you yet. An admin can assign them.
        </p>
      )}

      {(can(TAGS.FINANCE_DASHBOARD) ||
        can(TAGS.SALES_READ) ||
        can(TAGS.STOCK_READ) ||
        can(TAGS.INSTALLATIONS_READ) ||
        can(TAGS.SERVICE_READ) ||
        can(TAGS.LEAVE_APPLY) ||
        can(TAGS.ALLOWANCES_MANAGE)) && (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-h-full">
          {can(TAGS.FINANCE_DASHBOARD) && <FinanceCard />}
          {can(TAGS.SALES_READ) && !can(TAGS.FINANCE_DASHBOARD) && (
            <SalesCard title={can(TAGS.SALES_READ_ALL) ? "Sales this month" : "My sales this month"} />
          )}
          {can(TAGS.STOCK_READ) && <StockCard />}
          {can(TAGS.INSTALLATIONS_READ) && <InstallationsCard />}
          {can(TAGS.SERVICE_READ) && (
            <ServiceCard title={can(TAGS.SERVICE_READ_ALL) ? "Service" : "Service: my customers and jobs"} />
          )}
          {(can(TAGS.LEAVE_APPROVE) || can(TAGS.ALLOWANCES_MANAGE)) && <HrAdminCard />}
          {can(TAGS.LEAVE_APPLY) && <MyHrCard />}
        </div>
      )}

      {canSeeLeads && (
        <>
          <ErrorText error={summary.error ?? dueToday.error ?? recent.error} />

          <div className="grid gap-6 xl:grid-cols-5">
          <section className="xl:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Follow-ups due today &amp; overdue</h2>
              <Link href="/calendar" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                Calendar
              </Link>
            </div>
            {dueToday.data?.length === 0 && (
              <p className={`${panelClass} px-4 py-6 text-center text-sm text-neutral-500`}>Nothing due today. 🎉</p>
            )}
            <ul className="space-y-2">
              {dueToday.data?.map((f) => (
                <FollowUpItem
                  key={f.id}
                  followUp={f}
                  onChange={() => {
                    dueToday.reload();
                    summary.reload();
                  }}
                />
              ))}
            </ul>
          </section>

          <section className="xl:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Recent leads</h2>
              {can(TAGS.LEADS_WRITE) && <LinkButton href="/leads/new">New lead</LinkButton>}
            </div>
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white px-4 text-sm shadow-xs dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
              {recent.data?.items.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/leads/${lead.id}`} className="block truncate font-medium text-brand-700 hover:underline dark:text-brand-300">
                      {lead.name}
                    </Link>
                    <span className="text-xs text-neutral-500">
                      {productInterestLabel(lead)} · {formatDate(lead.createdAt)}
                    </span>
                  </div>
                  <StatusBadge status={lead.status} />
                </li>
              ))}
            </ul>
          </section>
          </div>
        </>
      )}

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
    </div>
  );
}
