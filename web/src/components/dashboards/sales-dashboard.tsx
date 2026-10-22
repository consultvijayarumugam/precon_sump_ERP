"use client";

import { CalendarClock, Contact, IndianRupee, TriangleAlert, Trophy } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ErrorText, LinkButton, panelClass, StatusBadge } from "@/components/ui";
import { formatDate, LeadListItem, Paginated, PRODUCT_LABELS } from "@/lib/crm";
import { formatINR } from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";
import {
  FollowUpsDueList,
  Greeting,
  KpiRow,
  KpiTile,
  PermissionTagsFooter,
  PipelineStrip,
  SectionHeader,
  useCrmSummary,
  useFollowUpsDue,
  WeekAhead,
} from "./shared";

interface SalesSummary {
  ordersThisMonth: number;
  valueThisMonth: string;
  awaitingDelivery: number;
}

/**
 * SALES: my pipeline, what I must do today, what I've won and earned this
 * month, and my week ahead. Everything is scoped to the salesperson's own leads.
 */
export function SalesDashboard() {
  const { can } = useAuth();
  const leads = can(TAGS.LEADS_READ);
  const summary = useCrmSummary(leads);
  const due = useFollowUpsDue(leads);
  const sales = useApi<SalesSummary>(can(TAGS.SALES_READ) ? "/sales-orders/summary" : null);
  const recent = useApi<Paginated<LeadListItem>>(leads ? "/leads?pageSize=5" : null);
  const overdueCount = summary.data?.overdueFollowUps ?? 0;

  return (
    <div className="space-y-8">
      <Greeting subtitle="Your leads, today's follow-ups and this month's results" />

      <ErrorText error={summary.error ?? sales.error} />
      <KpiRow>
        <KpiTile label="My open leads" value={summary.data?.openLeads} href="/leads" icon={Contact} module="crm" />
        <KpiTile
          label="Overdue follow-ups"
          value={summary.data ? overdueCount : null}
          hint={overdueCount === 0 ? "You're on top of it" : undefined}
          href="/follow-ups"
          icon={TriangleAlert}
          module="crm"
          alert={overdueCount > 0}
        />
        <KpiTile label="My won deals" value={summary.data?.leadsByStatus.WON} href="/leads/won" icon={Trophy} module="crm" />
        {can(TAGS.SALES_READ) ? (
          <KpiTile
            label="My revenue this month"
            value={sales.data ? formatINR(sales.data.valueThisMonth) : null}
            hint={sales.data && `${sales.data.ordersThisMonth} orders · ${sales.data.awaitingDelivery} awaiting delivery`}
            href="/finance/revenue"
            icon={IndianRupee}
            module="finance"
          />
        ) : (
          <KpiTile label="Upcoming follow-ups" value={summary.data?.upcomingFollowUps} href="/follow-ups" icon={CalendarClock} module="crm" />
        )}
      </KpiRow>
      {summary.data && <PipelineStrip summary={summary.data} />}

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="xl:col-span-3">
          <SectionHeader title="Follow-ups due today & overdue" module="crm" href="/follow-ups" />
          <FollowUpsDueList
            data={due.data}
            error={due.error}
            onChange={() => {
              due.reload();
              summary.reload();
            }}
          />
        </section>
        <section className="space-y-6 xl:col-span-2">
          <div>
            <SectionHeader title="My week ahead" module="crm" href="/calendar" linkLabel="Calendar" />
            <WeekAhead enabled={leads} />
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">My latest leads</h2>
              {can(TAGS.LEADS_WRITE) && <LinkButton href="/leads/new">New lead</LinkButton>}
            </div>
            <ul className={`${panelClass} divide-y divide-neutral-100 px-4 text-sm dark:divide-neutral-800`}>
              {recent.data?.items.length === 0 && <li className="py-4 text-neutral-500">No leads yet.</li>}
              {recent.data?.items.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/leads/${lead.id}`} className="block truncate font-medium text-brand-700 hover:underline dark:text-brand-300">
                      {lead.name}
                    </Link>
                    <span className="text-xs text-neutral-500">
                      {PRODUCT_LABELS[lead.productInterest]} · {formatDate(lead.createdAt)}
                    </span>
                  </div>
                  <StatusBadge status={lead.status} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
      <PermissionTagsFooter />
    </div>
  );
}
