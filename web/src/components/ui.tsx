// Small shared UI pieces so pages stay consistent.
import Link from "next/link";
import { ReactNode } from "react";
import { LeadStatus, STATUS_LABELS } from "@/lib/crm";
import { ORDER_STATUS_LABELS, OrderStatus } from "@/lib/finance";
import { formatMonth, LEAVE_STATUS_LABELS, LeaveStatus, shiftMonth } from "@/lib/hr";
import {
  INSTALLATION_STATUS_LABELS,
  InstallationStatus,
  JOB_PRIORITY_LABELS,
  JOB_STATUS_LABELS,
  JobPriority,
  JobStatus,
  SiteVisitTag,
  TagColor,
} from "@/lib/service";

export const inputClass =
  "w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
export const buttonClass =
  "rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900";
export const secondaryButtonClass =
  "rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700";

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  CONTACTED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  QUALIFIED: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  QUOTED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  WON: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  LOST: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}

export function NoAccess({ tag }: { tag: string }) {
  return (
    <p className="rounded border border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
      You don&apos;t have access to this page. It needs the <code>{tag}</code> tag; ask an admin.
    </p>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-red-600">{error}</p> : null;
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass}>
      {children}
    </Link>
  );
}

export const thClass = "py-2 pr-3 font-medium";
export const tdClass = "py-2 pr-3";
export const tableClass = "w-full min-w-[640px] text-left text-sm";
export const theadClass = "border-b border-neutral-200 text-neutral-500 dark:border-neutral-800";
export const tbodyClass = "divide-y divide-neutral-200 dark:divide-neutral-800";
/** Row tint for anything overdue, matching overdue follow-ups. */
export const overdueRowClass = "bg-red-50 dark:bg-red-950/40";

const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  CONFIRMED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  DELIVERED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  CANCELLED: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_STYLES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export function OverdueTag({ days }: { days?: number }) {
  return (
    <span className="text-xs font-medium text-red-600">
      Overdue{days !== undefined ? ` ${days}d` : ""}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

export function Card({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">{title}</h2>
        {href && (
          <Link href={href} className="text-sm underline">
            Open
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "alert" }) {
  return (
    <div>
      <div className={`text-lg font-semibold ${tone === "alert" ? "text-red-600" : ""}`}>{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

const INSTALLATION_STATUS_STYLES: Record<InstallationStatus, string> = {
  SCHEDULED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
};

export function InstallationStatusBadge({ status }: { status: InstallationStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${INSTALLATION_STATUS_STYLES[status]}`}>
      {INSTALLATION_STATUS_LABELS[status]}
    </span>
  );
}

const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  OPEN: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${JOB_STATUS_STYLES[status]}`}>
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_STYLES: Record<JobPriority, string> = {
  URGENT: "bg-red-600 text-white",
  HIGH: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  MEDIUM: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  LOW: "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400",
};

export function PriorityBadge({ priority }: { priority: JobPriority }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}>
      {JOB_PRIORITY_LABELS[priority]}
    </span>
  );
}

// Full class strings so Tailwind keeps them.
const TAG_STYLES: Record<TagColor, string> = {
  slate: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
  sky: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
  green: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  amber: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  red: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
  violet: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800",
  pink: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950 dark:text-pink-200 dark:border-pink-800",
  teal: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-800",
};

/** A site-visit tag chip. Pass onClick to make it a toggle. */
export function TagChip({
  tag,
  selected,
  onClick,
}: {
  tag: Pick<SiteVisitTag, "name" | "color" | "isActive">;
  selected?: boolean;
  onClick?: () => void;
}) {
  const style = TAG_STYLES[tag.color] ?? TAG_STYLES.slate;
  const className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${style} ${
    onClick && !selected ? "opacity-50" : ""
  } ${tag.isActive ? "" : "line-through"}`;
  return onClick ? (
    <button type="button" className={className} onClick={onClick} aria-pressed={selected}>
      {selected && "✓ "}
      {tag.name}
    </button>
  ) : (
    <span className={className}>{tag.name}</span>
  );
}

const LEAVE_STATUS_STYLES: Record<LeaveStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  CANCELLED: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

/** Status badge for leave applications and allowance claims (same four words). */
export function ApprovalBadge({ status }: { status: LeaveStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${LEAVE_STATUS_STYLES[status]}`}>
      {LEAVE_STATUS_LABELS[status]}
    </span>
  );
}

/** ← Month → picker for "YYYY-MM" values. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button className={`${secondaryButtonClass} py-1`} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        ←
      </button>
      <span className="min-w-32 text-center font-medium">{formatMonth(month)}</span>
      <button className={`${secondaryButtonClass} py-1`} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">
        →
      </button>
    </div>
  );
}
