"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import { FinanceCard, InstallationsCard, SalesCard, ServiceCard, StockCard } from "@/components/dashboard-cards";
import { FollowUpItem } from "@/components/follow-up-item";
import { ErrorText, LinkButton, StatusBadge } from "@/components/ui";
import { queryString } from "@/lib/api";
import {
  CrmSummary,
  FollowUpWithLead,
  formatDate,
  LEAD_STATUSES,
  LeadListItem,
  Paginated,
  PRODUCT_LABELS,
  STATUS_LABELS,
} from "@/lib/crm";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

function Tile({ label, value, href, tone }: { label: string; value: number; href: string; tone?: "alert" }) {
  return (
    <Link
      href={href}
      className={`rounded border p-3 ${
        tone === "alert" && value > 0
          ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-neutral-500">{label}</div>
    </Link>
  );
}

export default function DashboardPage() {
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

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold">Welcome, {user.fullName}</h1>
        <p className="text-sm text-neutral-500">
          {user.role.name} ·{" "}
          {can(TAGS.LEADS_READ_ALL) ? "You can see all leads" : canSeeLeads ? "Showing leads assigned to you" : `Modules: ${user.modules.join(", ") || "none"}`}
        </p>
      </section>

      {!hasAnyModule && (
        <p className="text-sm text-neutral-500">
          No modules are assigned to you yet. An admin can assign them.
        </p>
      )}

      {(can(TAGS.FINANCE_DASHBOARD) ||
        can(TAGS.SALES_READ) ||
        can(TAGS.STOCK_READ) ||
        can(TAGS.INSTALLATIONS_READ) ||
        can(TAGS.SERVICE_READ)) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {can(TAGS.FINANCE_DASHBOARD) && <FinanceCard />}
          {can(TAGS.SALES_READ) && !can(TAGS.FINANCE_DASHBOARD) && (
            <SalesCard title={can(TAGS.SALES_READ_ALL) ? "Sales this month" : "My sales this month"} />
          )}
          {can(TAGS.STOCK_READ) && <StockCard />}
          {can(TAGS.INSTALLATIONS_READ) && <InstallationsCard />}
          {can(TAGS.SERVICE_READ) && (
            <ServiceCard title={can(TAGS.SERVICE_READ_ALL) ? "Service" : "Service: my customers and jobs"} />
          )}
        </div>
      )}

      {canSeeLeads && (
        <>
          <ErrorText error={summary.error ?? dueToday.error ?? recent.error} />

          {summary.data && (
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Open leads" value={summary.data.openLeads} href="/leads" />
                <Tile label="Won" value={summary.data.leadsByStatus.WON} href="/leads/won" />
                <Tile label="Overdue follow-ups" value={summary.data.overdueFollowUps} href="/follow-ups" tone="alert" />
                <Tile label="Upcoming follow-ups" value={summary.data.upcomingFollowUps} href="/follow-ups" />
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {LEAD_STATUSES.map((s) => (
                  <Link
                    key={s}
                    href={s === "WON" ? "/leads/won" : `/leads?status=${s}`}
                    className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  >
                    {STATUS_LABELS[s]}: <strong>{summary.data!.leadsByStatus[s]}</strong>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Due today and overdue</h2>
              <Link href="/calendar" className="text-sm underline">
                Calendar
              </Link>
            </div>
            {dueToday.data?.length === 0 && <p className="text-sm text-neutral-500">Nothing due. 🎉</p>}
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

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Recent leads</h2>
              {can(TAGS.LEADS_WRITE) && <LinkButton href="/leads/new">New lead</LinkButton>}
            </div>
            <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
              {recent.data?.items.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/leads/${lead.id}`} className="font-medium underline">
                    {lead.name}
                  </Link>
                  <span className="text-neutral-500">
                    {PRODUCT_LABELS[lead.productInterest]} · {formatDate(lead.createdAt)}
                  </span>
                  <StatusBadge status={lead.status} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <details className="text-sm text-neutral-500">
        <summary className="cursor-pointer">Your permission tags ({user.permissions.length})</summary>
        <ul className="mt-2 list-inside list-disc">
          {user.permissions.map((p) => (
            <li key={p}>
              <code>{p}</code>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
