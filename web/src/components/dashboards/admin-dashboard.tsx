"use client";

import { BadgeIndianRupee, CalendarRange, HandCoins, HardHat, Landmark, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { HrAdminCard, StockCard } from "@/components/dashboard-cards";
import { Card, ErrorText, InstallationStatusBadge, OverdueTag, Stat } from "@/components/ui";
import { formatDateOnly, formatINR } from "@/lib/finance";
import { Allowance, ALLOWANCE_TYPE_LABELS, LEAVE_TYPE_LABELS, LeaveApplication } from "@/lib/hr";
import { Installation } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";
import { EmptyNote, Greeting, KpiRow, KpiTile, PermissionTagsFooter, SectionHeader, useDayRanges } from "./shared";

interface FinanceSummary {
  revenueThisMonth: string;
  ordersThisMonth: number;
  receivable: string;
  overdueReceivable: string;
  overdueOrders: number;
  payable: string;
  overduePayable: string;
}

interface RevenueReport {
  totals: { orders: number; revenue: string; collected: string; outstanding: string };
}

interface InstallationSummary {
  scheduledThisWeek: number;
  inProgress: number;
  late: number;
  completed: number;
}

/** Installations scheduled for today (count + the first few). */
function InstallationsToday() {
  const { todayKey } = useDayRanges();
  const today = useApi<Installation[]>(`/installations?from=${todayKey}&to=${todayKey}`);
  const summary = useApi<InstallationSummary>("/installations/summary");
  const shown = today.data?.slice(0, 4) ?? [];

  return (
    <Card title="Installations today" href="/installations" module="operations" icon={HardHat}>
      <ErrorText error={today.error ?? summary.error} />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Stat label="Scheduled today" value={today.data?.length ?? "–"} />
        <Stat label="Next 7 days" value={summary.data?.scheduledThisWeek ?? "–"} />
        <Stat label="Running late" value={summary.data?.late ?? "–"} tone={summary.data && summary.data.late > 0 ? "alert" : undefined} />
      </div>
      {today.data && today.data.length === 0 && <p className="text-sm text-neutral-500">No installations scheduled for today.</p>}
      <ul className="space-y-2 text-sm">
        {shown.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/installations/${i.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                {i.salesOrder.customerName}
              </Link>
              <div className="truncate text-xs text-neutral-500">
                {i.siteAddress} · {i.assignedTo?.fullName ?? "unassigned"}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              {i.isLate && <OverdueTag />}
              <InstallationStatusBadge status={i.status} />
            </span>
          </li>
        ))}
      </ul>
      {today.data && today.data.length > shown.length && (
        <p className="mt-2 text-xs text-neutral-500">+{today.data.length - shown.length} more today</p>
      )}
    </Card>
  );
}

/** The first few leave requests and allowance claims awaiting a decision. */
function WaitingForYou() {
  const { can } = useAuth();
  const leave = useApi<LeaveApplication[]>(can(TAGS.LEAVE_APPROVE) ? "/leave/applications?status=PENDING" : null);
  const claims = useApi<Allowance[]>(can(TAGS.ALLOWANCES_MANAGE) ? "/allowances?status=PENDING" : null);
  const nothing = leave.data?.length === 0 && claims.data?.length === 0;

  return (
    <Card title="Waiting for your decision" module="hr" icon={CalendarRange}>
      <ErrorText error={leave.error ?? claims.error} />
      {nothing && <p className="text-sm text-neutral-500">All caught up. Nothing pending. ✅</p>}
      <ul className="space-y-2 text-sm">
        {leave.data?.slice(0, 3).map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="font-medium">{l.user.fullName}</span>
              <span className="text-neutral-500">
                {" "}
                · {LEAVE_TYPE_LABELS[l.type]} leave, {l.days} day{l.days === 1 ? "" : "s"} from {formatDateOnly(l.startDate)}
              </span>
            </span>
            <Link href="/leave/approvals" className="shrink-0 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Review
            </Link>
          </li>
        ))}
        {claims.data?.slice(0, 3).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="font-medium">{a.user.fullName}</span>
              <span className="text-neutral-500">
                {" "}
                · {ALLOWANCE_TYPE_LABELS[a.type]} allowance {formatINR(a.amount)}
              </span>
            </span>
            <Link href="/allowances" className="shrink-0 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Review
            </Link>
          </li>
        ))}
      </ul>
      {((leave.data?.length ?? 0) > 3 || (claims.data?.length ?? 0) > 3) && (
        <p className="mt-2 text-xs text-neutral-500">More waiting on the approvals pages.</p>
      )}
    </Card>
  );
}

/**
 * ADMIN: an at-a-glance executive view. Money first, then today's operations
 * and stock, then HR items waiting for a decision. Summary cards, few lists.
 */
export function AdminDashboard() {
  const { can } = useAuth();
  const finance = useApi<FinanceSummary>(can(TAGS.FINANCE_DASHBOARD) ? "/finance/summary" : null);
  // No date range = all time.
  const allTime = useApi<RevenueReport>(can(TAGS.FINANCE_DASHBOARD) ? "/finance/revenue-by-employee" : null);
  const overdue = finance.data ? Number(finance.data.overdueReceivable) > 0 : false;

  return (
    <div className="space-y-8">
      <Greeting subtitle="Executive overview · money, operations and people at a glance" />

      {can(TAGS.FINANCE_DASHBOARD) && (
        <section>
          <SectionHeader title="Money" module="finance" href="/finance/revenue" linkLabel="Revenue by employee" />
          <ErrorText error={finance.error ?? allTime.error} />
          <KpiRow>
            <KpiTile
              label="Total revenue so far"
              value={allTime.data ? formatINR(allTime.data.totals.revenue) : null}
              hint={allTime.data && `${allTime.data.totals.orders} orders, all time`}
              href="/finance/revenue"
              icon={Landmark}
              module="finance"
            />
            <KpiTile
              label="Revenue this month"
              value={finance.data ? formatINR(finance.data.revenueThisMonth) : null}
              hint={finance.data && `${finance.data.ordersThisMonth} orders this month`}
              href="/orders"
              icon={TrendingUp}
              module="finance"
            />
            <KpiTile
              label="Collected so far"
              value={allTime.data ? formatINR(allTime.data.totals.collected) : null}
              hint="Advances and payments received"
              href="/orders"
              icon={HandCoins}
              module="finance"
            />
            <KpiTile
              label="Customers owe us"
              value={finance.data ? formatINR(finance.data.receivable) : null}
              hint={
                finance.data &&
                (overdue
                  ? `${formatINR(finance.data.overdueReceivable)} overdue (${finance.data.overdueOrders} orders)`
                  : "Nothing overdue")
              }
              href="/finance/overdue"
              icon={BadgeIndianRupee}
              module="finance"
              alert={overdue}
            />
          </KpiRow>
        </section>
      )}

      <section>
        <SectionHeader title="Operations today" module="operations" />
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-h-full">
          {can(TAGS.INSTALLATIONS_READ) && <InstallationsToday />}
          {can(TAGS.STOCK_READ) && <StockCard />}
        </div>
      </section>

      {(can(TAGS.LEAVE_APPROVE) || can(TAGS.ALLOWANCES_MANAGE)) && (
        <section>
          <SectionHeader title="People" module="hr" href="/leave/approvals" linkLabel="Leave approvals" />
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-h-full">
            <HrAdminCard />
            <WaitingForYou />
          </div>
        </section>
      )}

      {!can(TAGS.FINANCE_DASHBOARD) && !can(TAGS.INSTALLATIONS_READ) && !can(TAGS.STOCK_READ) && (
        <EmptyNote>Your account doesn&apos;t include the admin modules yet.</EmptyNote>
      )}
      <PermissionTagsFooter />
    </div>
  );
}
