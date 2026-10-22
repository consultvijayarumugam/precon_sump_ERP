// Shared UI pieces and style tokens, so every page looks the same.
// Change the look here; pages only compose these.
import type { LucideIcon } from "lucide-react";
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
import { MODULES, ModuleKey } from "@/lib/modules";

// --- Form controls and buttons ---------------------------------------------

/** Input look without a width, for inline filters. */
export const inputBaseClass =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-xs placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-100 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:bg-neutral-800";
export const inputClass = `w-full ${inputBaseClass}`;

// Buttons come in three sizes. Pick a size constant rather than appending
// padding classes (Tailwind wouldn't reliably let an appended py-1 win).
const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primaryLook = "bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400";
const secondaryLook =
  "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800";
const SIZE = { md: "px-3.5 py-2 text-sm", compact: "px-3 py-1.5 text-sm", sm: "px-2.5 py-1 text-xs" };

export const buttonClass = `${buttonBase} ${primaryLook} ${SIZE.md}`;
export const buttonCompactClass = `${buttonBase} ${primaryLook} ${SIZE.compact}`;
export const buttonSmClass = `${buttonBase} ${primaryLook} ${SIZE.sm}`;
export const secondaryButtonClass = `${buttonBase} ${secondaryLook} ${SIZE.md}`;
export const secondaryButtonCompactClass = `${buttonBase} ${secondaryLook} ${SIZE.compact}`;
export const secondaryButtonSmClass = `${buttonBase} ${secondaryLook} ${SIZE.sm}`;

// --- Surfaces ----------------------------------------------------------------

/** A white card/panel. */
export const panelClass =
  "rounded-lg border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900";
/** Red-tinted panel for overdue/alert content. */
export const alertPanelClass =
  "rounded-lg border border-red-200 bg-red-50 shadow-xs dark:border-red-900 dark:bg-red-950/40";

// --- Tables ------------------------------------------------------------------

export const tableWrapClass = `overflow-x-auto ${panelClass}`;
export const tableClass = "w-full min-w-[640px] text-left text-sm";
export const theadClass =
  "border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60";
export const thClass = "px-4 py-2.5 font-medium";
export const tdClass = "px-4 py-3 align-top";
export const tbodyClass = "divide-y divide-neutral-100 dark:divide-neutral-800";
/** Row tint for anything overdue, matching overdue follow-ups. */
export const overdueRowClass = "bg-red-50/70 dark:bg-red-950/30";

// --- Badges ------------------------------------------------------------------

type Tone = "neutral" | "blue" | "indigo" | "violet" | "amber" | "green" | "red" | "solidRed";

const TONES: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-300",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-300",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-950 dark:text-indigo-300",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-950 dark:text-amber-300",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300",
  red: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300",
  solidRed: "bg-red-600 text-white ring-red-700",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const LEAD_TONES: Record<LeadStatus, Tone> = {
  NEW: "blue",
  CONTACTED: "indigo",
  QUALIFIED: "violet",
  QUOTED: "amber",
  WON: "green",
  LOST: "neutral",
};
export function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={LEAD_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

const ORDER_TONES: Record<OrderStatus, Tone> = { CONFIRMED: "amber", DELIVERED: "green", CANCELLED: "neutral" };
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

const INSTALLATION_TONES: Record<InstallationStatus, Tone> = { SCHEDULED: "blue", IN_PROGRESS: "amber", COMPLETED: "green" };
export function InstallationStatusBadge({ status }: { status: InstallationStatus }) {
  return <Badge tone={INSTALLATION_TONES[status]}>{INSTALLATION_STATUS_LABELS[status]}</Badge>;
}

const JOB_TONES: Record<JobStatus, Tone> = { OPEN: "blue", IN_PROGRESS: "amber", RESOLVED: "green" };
export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={JOB_TONES[status]}>{JOB_STATUS_LABELS[status]}</Badge>;
}

const PRIORITY_TONES: Record<JobPriority, Tone> = { URGENT: "solidRed", HIGH: "red", MEDIUM: "neutral", LOW: "neutral" };
export function PriorityBadge({ priority }: { priority: JobPriority }) {
  return <Badge tone={PRIORITY_TONES[priority]}>{JOB_PRIORITY_LABELS[priority]}</Badge>;
}

const APPROVAL_TONES: Record<LeaveStatus, Tone> = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "neutral" };
/** Status badge for leave applications and allowance claims (same four words). */
export function ApprovalBadge({ status }: { status: LeaveStatus }) {
  return <Badge tone={APPROVAL_TONES[status]}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}

export function OverdueTag({ days }: { days?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
      <span className="size-1.5 rounded-full bg-red-600 dark:bg-red-400" aria-hidden />
      Overdue{days !== undefined ? ` ${days}d` : ""}
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
  const className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${style} ${
    onClick && !selected ? "opacity-50 hover:opacity-80" : ""
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

// --- Page structure ----------------------------------------------------------

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-neutral-900 dark:text-neutral-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function NoAccess({ tag }: { tag: string }) {
  return (
    <div className={`${panelClass} p-6 text-sm text-neutral-600 dark:text-neutral-400`}>
      <p className="font-medium text-neutral-900 dark:text-neutral-100">You don&apos;t have access to this page.</p>
      <p className="mt-1">
        It needs the <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">{tag}</code> tag; ask an admin.
      </p>
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p> : null;
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass}>
      {children}
    </Link>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
    </label>
  );
}

/**
 * Dashboard-style card. `module` gives it that module's colour (a thin top bar
 * and a tinted icon chip) so cards read as CRM / Finance / Operations / HR.
 */
export function Card({
  title,
  href,
  module,
  icon: Icon,
  children,
}: {
  title: string;
  href?: string;
  module?: ModuleKey;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  const mod = module ? MODULES[module] : null;
  return (
    <section className={`${panelClass} relative flex flex-col overflow-hidden p-5`}>
      {mod && <span className={`absolute inset-x-0 top-0 h-1 ${mod.dot}`} aria-hidden />}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className={`grid size-8 place-items-center rounded-lg ${mod?.chip ?? MODULES.home.chip}`}>
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
            {mod && <p className={`text-[11px] font-semibold uppercase tracking-wider ${mod.text}`}>{mod.label}</p>}
          </div>
        </div>
        {href && (
          <Link
            href={href}
            className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950"
          >
            View all →
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "alert" }) {
  return (
    <div>
      <div
        className={`text-2xl font-bold tracking-tight tabular-nums ${
          tone === "alert" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-50"
        }`}
      >
        {value}
      </div>
      <div className={`mt-0.5 text-xs ${tone === "alert" ? "font-medium text-red-700 dark:text-red-300" : "text-neutral-500"}`}>{label}</div>
    </div>
  );
}

/** ← Month → picker for "YYYY-MM" values. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button className={secondaryButtonCompactClass} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        ←
      </button>
      <span className="min-w-36 text-center text-sm font-semibold">{formatMonth(month)}</span>
      <button className={secondaryButtonCompactClass} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">
        →
      </button>
    </div>
  );
}
