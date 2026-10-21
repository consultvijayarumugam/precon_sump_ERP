"use client";

import Link from "next/link";
import { Card, ErrorText, Stat } from "@/components/ui";
import { dayKey } from "@/lib/crm";
import { formatDateOnly, formatINR, Product } from "@/lib/finance";
import { Installation } from "@/lib/service";
import { useApi } from "@/lib/use-api";

interface FinanceSummary {
  revenueThisMonth: string;
  ordersThisMonth: number;
  receivable: string;
  overdueReceivable: string;
  overdueOrders: number;
  payable: string;
  overduePayable: string;
}

/** Company-wide money at a glance (finance.dashboard). */
export function FinanceCard() {
  const { data, error } = useApi<FinanceSummary>("/finance/summary");
  return (
    <Card title="Finance" href="/finance/revenue">
      <ErrorText error={error} />
      {data && (
        <div className="grid grid-cols-2 gap-4">
          <Stat label={`Revenue this month (${data.ordersThisMonth} orders)`} value={formatINR(data.revenueThisMonth)} />
          <Stat label="Customers owe us" value={formatINR(data.receivable)} />
          <Link href="/finance/overdue">
            <Stat
              label={`Overdue from customers (${data.overdueOrders})`}
              value={formatINR(data.overdueReceivable)}
              tone={Number(data.overdueReceivable) > 0 ? "alert" : undefined}
            />
          </Link>
          <Link href="/vendors">
            <Stat
              label={`We owe vendors (${formatINR(data.overduePayable)} overdue)`}
              value={formatINR(data.payable)}
              tone={Number(data.overduePayable) > 0 ? "alert" : undefined}
            />
          </Link>
        </div>
      )}
    </Card>
  );
}

interface SalesSummary {
  ordersThisMonth: number;
  valueThisMonth: string;
  awaitingDelivery: number;
}

/** The user's own orders this month (sales.read). */
export function SalesCard({ title }: { title: string }) {
  const { data, error } = useApi<SalesSummary>("/sales-orders/summary");
  return (
    <Card title={title} href="/orders">
      <ErrorText error={error} />
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Order value this month" value={formatINR(data.valueThisMonth)} />
          <Stat label="Orders this month" value={data.ordersThisMonth} />
          <Stat label="Awaiting delivery" value={data.awaitingDelivery} />
        </div>
      )}
    </Card>
  );
}

/** Finished-goods stock with low items flagged (stock.read). */
export function StockCard() {
  const { data, error } = useApi<{ lowCount: number; items: Product[] }>("/stock");
  return (
    <Card title={data && data.lowCount > 0 ? `Stock: ${data.lowCount} low` : "Stock"} href="/stock">
      <ErrorText error={error} />
      <ul className="space-y-1 text-sm">
        {data?.items.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <span className={p.isLow ? "font-medium text-red-700 dark:text-red-300" : ""}>{p.name}</span>
            <span className="flex items-center gap-2">
              <span className={p.isLow ? "font-semibold text-red-700 dark:text-red-300" : "font-medium"}>
                {p.quantityOnHand} {p.unit}
              </span>
              {p.isLow && <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs text-white">Low</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface InstallationSummary {
  scheduledThisWeek: number;
  inProgress: number;
  late: number;
  completed: number;
}

/** Upcoming installations (installations.read). */
export function InstallationsCard() {
  const summary = useApi<InstallationSummary>("/installations/summary");
  const upcoming = useApi<Installation[]>(`/installations?from=${dayKey(new Date())}&status=SCHEDULED`);
  return (
    <Card title="Installations" href="/installations">
      <ErrorText error={summary.error ?? upcoming.error} />
      {summary.data && (
        <div className="mb-3 grid grid-cols-3 gap-4">
          <Stat label="Scheduled next 7 days" value={summary.data.scheduledThisWeek} />
          <Stat label="In progress" value={summary.data.inProgress} />
          <Stat label="Late" value={summary.data.late} tone={summary.data.late > 0 ? "alert" : undefined} />
        </div>
      )}
      <ul className="space-y-1 text-sm">
        {upcoming.data?.slice(0, 3).map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            <Link href={`/installations/${i.id}`} className="underline">
              {i.salesOrder.customerName}
            </Link>
            <span className="text-neutral-500">
              {formatDateOnly(i.scheduledDate)} · {i.assignedTo?.fullName ?? "unassigned"}
            </span>
          </li>
        ))}
        {upcoming.data?.length === 0 && <li className="text-neutral-500">Nothing scheduled.</li>}
      </ul>
    </Card>
  );
}

interface ServiceSummary {
  open: number;
  inProgress: number;
  urgentOrHigh: number;
  overdueFollowUps: number;
  upcomingFollowUps: number;
}

/** After-sales service at a glance (service.read, within the user's scope). */
export function ServiceCard({ title }: { title: string }) {
  const { data, error } = useApi<ServiceSummary>("/service-jobs/summary");
  return (
    <Card title={title} href="/service">
      <ErrorText error={error} />
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Open" value={data.open} />
          <Stat label="In progress" value={data.inProgress} />
          <Stat label="Urgent / high" value={data.urgentOrHigh} tone={data.urgentOrHigh > 0 ? "alert" : undefined} />
          <Link href="/service/follow-ups">
            <Stat
              label="Overdue follow-ups"
              value={data.overdueFollowUps}
              tone={data.overdueFollowUps > 0 ? "alert" : undefined}
            />
          </Link>
          <Link href="/service/follow-ups">
            <Stat label="Upcoming follow-ups" value={data.upcomingFollowUps} />
          </Link>
        </div>
      )}
    </Card>
  );
}
