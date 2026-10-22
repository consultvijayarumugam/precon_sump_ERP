"use client";

import { BadgeIndianRupee, Boxes, ClipboardList, HardHat, Receipt, Umbrella, Wrench } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { Card, ErrorText, Stat } from "@/components/ui";
import { dayKey } from "@/lib/crm";
import { formatDateOnly, formatINR, Product } from "@/lib/finance";
import {
  Allowance,
  AllowanceSummary,
  currentMonth,
  Holiday,
  LeaveApplication,
  LeaveBalance,
  LopSummary,
  TeamCalendar,
} from "@/lib/hr";
import { Installation } from "@/lib/service";
import { TAGS } from "@/lib/tags";
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
    <Card title="Money this month" href="/finance/revenue" module="finance" icon={BadgeIndianRupee}>
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
    <Card title={title} href="/orders" module="finance" icon={Receipt}>
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
    <Card title={data && data.lowCount > 0 ? `Stock · ${data.lowCount} low` : "Stock"} href="/stock" module="operations" icon={Boxes}>
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
    <Card title="Installations" href="/installations" module="operations" icon={HardHat}>
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
            <Link href={`/installations/${i.id}`} className="text-brand-700 hover:underline dark:text-brand-300">
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
    <Card title={title} href="/service" module="operations" icon={Wrench}>
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

/** The employee's own HR picture (leave.apply): balance, pending, next holiday, allowances. */
export function MyHrCard() {
  const { user, can } = useAuth();
  const month = currentMonth();
  const balance = useApi<LeaveBalance>("/leave/balance");
  const mine = useApi<LeaveApplication[]>("/leave/mine");
  const holidays = useApi<Holiday[]>(can(TAGS.LEAVE_READ) ? "/holidays/upcoming" : null);
  const allowances = useApi<AllowanceSummary>(can(TAGS.ALLOWANCES_READ) ? `/allowances/summary?month=${month}` : null);
  const myAllowance = allowances.data?.rows.find((r) => r.employee.id === user.id);
  const pending = mine.data?.filter((l) => l.status === "PENDING").length ?? 0;

  return (
    <Card title="My leave & allowances" href="/leave" module="hr" icon={Umbrella}>
      <ErrorText error={balance.error ?? mine.error} />
      <div className="grid grid-cols-3 gap-4">
        {balance.data?.paid.map((p) => (
          <Stat key={p.type} label={`${p.type === "CASUAL" ? "Casual" : "Sick"} days left`} value={p.remaining} />
        ))}
        <Stat label="Leave requests pending" value={pending} />
      </div>
      <div className="mt-3 space-y-1 text-sm">
        {holidays.data?.[0] && (
          <p>
            Next holiday: <strong>{holidays.data[0].name}</strong>, {formatDateOnly(holidays.data[0].date)}
          </p>
        )}
        {allowances.data && (
          <p>
            <Link href="/allowances" className="text-brand-700 hover:underline dark:text-brand-300">
              Allowances this month
            </Link>
            : {formatINR(myAllowance?.approvedTotal ?? 0)} approved
            {Number(myAllowance?.pendingTotal ?? 0) > 0 && `, ${formatINR(myAllowance!.pendingTotal)} pending`}
          </p>
        )}
      </div>
    </Card>
  );
}

/** HR to-dos for approvers/managers: pending leave and claims, who is off today, LOP this month. */
export function HrAdminCard() {
  const { can } = useAuth();
  const month = currentMonth();
  const today = dayKey(new Date());
  const approver = can(TAGS.LEAVE_APPROVE);
  const pendingLeave = useApi<LeaveApplication[]>(approver ? "/leave/applications?status=PENDING" : null);
  const lop = useApi<LopSummary>(approver ? `/lop/summary?month=${month}` : null);
  const offToday = useApi<TeamCalendar>(can(TAGS.LEAVE_READ) ? `/leave/calendar?from=${today}&to=${today}` : null);
  const claims = useApi<Allowance[]>(can(TAGS.ALLOWANCES_MANAGE) ? "/allowances?status=PENDING" : null);
  const off = offToday.data?.leave.filter((l) => l.status === "APPROVED" && l.workingDates.includes(today)) ?? [];

  return (
    <Card title="HR approvals" href={approver ? "/leave/approvals" : "/allowances"} module="hr" icon={ClipboardList}>
      <div className="grid grid-cols-3 gap-4">
        {pendingLeave.data && (
          <Link href="/leave/approvals">
            <Stat label="Leave to approve" value={pendingLeave.data.length} tone={pendingLeave.data.length > 0 ? "alert" : undefined} />
          </Link>
        )}
        {claims.data && (
          <Link href="/allowances">
            <Stat label="Allowance claims to approve" value={claims.data.length} tone={claims.data.length > 0 ? "alert" : undefined} />
          </Link>
        )}
        {lop.data && (
          <Link href="/hr/lop">
            <Stat label={`LOP days this month (${lop.data.totals.employeesWithLop} people)`} value={lop.data.totals.lopDays} />
          </Link>
        )}
      </div>
      <p className="mt-3 text-sm">
        Off today:{" "}
        {offToday.data?.holidays[0] ? (
          <strong>Company holiday ({offToday.data.holidays[0].name})</strong>
        ) : off.length === 0 ? (
          <span className="text-neutral-500">nobody</span>
        ) : (
          off.map((l) => l.user.fullName).join(", ")
        )}
      </p>
    </Card>
  );
}
