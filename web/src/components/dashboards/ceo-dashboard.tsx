"use client";

import {
  AlarmClock,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  Gauge,
  IndianRupee,
  Inbox,
  Minus,
  PhoneCall,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { VisitsMap } from "@/components/check-in";
import { ErrorText } from "@/components/ui";
import { SOURCE_LABELS } from "@/lib/crm";
import { formatINR, formatINRShort } from "@/lib/finance";
import { useApi } from "@/lib/use-api";
import { Flag, MasterDashboardData, percent } from "@/lib/workflow";
import { MyReminders } from "./my-reminders";

// --- Building blocks ---------------------------------------------------------------

const cardClass =
  "rounded-2xl border border-[var(--ps-line)] bg-[var(--ps-card)] shadow-[0_1px_2px_rgba(15,27,45,0.04),0_10px_30px_-18px_rgba(15,27,45,0.25)]";

function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${cardClass} flex flex-col p-5 sm:p-6 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--ps-ink)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--ps-ink-3)]">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--ps-blue-600)] hover:underline dark:text-[var(--ps-mark)]">
      {children} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/**
 * Change vs the previous period. Up is emerald, down is slate: a dip is
 * information, not an emergency, so it never borrows the urgent red.
 */
function Delta({ now, before, label, money = false }: { now: number; before: number; label: string; money?: boolean }) {
  const diff = now - before;
  const flat = diff === 0;
  const pct = before === 0 ? null : Math.round((diff / before) * 100);
  const Icon = flat ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    : diff > 0
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  const amount = pct === null ? (flat ? "no change" : "new") : `${diff > 0 ? "+" : ""}${pct}%`;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums ${tone}`}>
        <Icon className="size-3" aria-hidden />
        {amount}
      </span>
      <span className="text-[var(--ps-ink-3)]">
        vs {money ? formatINRShort(before) : before.toLocaleString("en-IN")} {label}
      </span>
    </span>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  delta,
  foot,
  urgent,
  href,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  delta?: ReactNode;
  foot?: ReactNode;
  urgent?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`${cardClass} group relative flex flex-col gap-2 overflow-hidden p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-16px_rgba(15,76,129,0.35)] ${
        urgent ? "border-red-200 dark:border-red-900/70" : ""
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${urgent ? "bg-red-500" : "bg-gradient-to-r from-[var(--ps-blue-600)] to-[var(--ps-aqua-500)]"}`} aria-hidden />
      <span className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ps-ink-3)]">{label}</span>
        <span
          className={`grid size-8 place-items-center rounded-lg ${
            urgent ? "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300" : "bg-[var(--ps-tint-50)] text-[var(--ps-blue-600)] dark:text-[var(--ps-mark)]"
          }`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </span>
      <span className={`text-[34px] leading-none font-bold tracking-tight tabular-nums ${urgent ? "text-red-700 dark:text-red-300" : "text-[var(--ps-ink)]"}`}>{value}</span>
      {delta && <span>{delta}</span>}
      {foot && <span className="text-xs text-[var(--ps-ink-2)]">{foot}</span>}
    </Link>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--ps-ocean-700)] to-[var(--ps-blue-600)] text-[11px] font-bold text-white">
      {initials(name)}
    </span>
  );
}

// --- Charts ------------------------------------------------------------------------

const dayFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayNum = new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "UTC" });

/** 14 days of incoming leads as thin bars; today in the aqua accent. Hover or focus a day for its count. */
function LeadTrend({ daily }: { daily: { date: string; leads: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.leads));
  const top = Math.max(4, Math.ceil(max / 4) * 4); // a round axis top
  const total = daily.reduce((n, d) => n + d.leads, 0);
  const avg = total / daily.length;
  const shown = hover ?? daily.length - 1;
  const point = daily[shown];

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-2xl font-bold tabular-nums text-[var(--ps-ink)]">{point.leads}</span>
        <span className="text-sm text-[var(--ps-ink-2)]">
          {hover === null ? "today" : `on ${dayFormat.format(new Date(`${point.date}T00:00:00Z`))}`}
        </span>
        <span className="ml-auto text-xs text-[var(--ps-ink-3)]">
          {total} in 14 days · avg {avg.toFixed(1)}/day
        </span>
      </div>
      <div className="relative h-40" role="img" aria-label={`Leads per day, last 14 days: ${daily.map((d) => d.leads).join(", ")}`}>
        {/* Recessive grid: baseline, half, top */}
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-[var(--ps-line)]" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 right-0 bg-[var(--ps-card)] pl-1 text-[10px] tabular-nums text-[var(--ps-ink-3)]">{Math.round(top * f)}</span>
          </div>
        ))}
        <div className="absolute inset-0 right-6 flex items-end gap-[2px] sm:gap-1">
          {daily.map((d, i) => {
            const isToday = i === daily.length - 1;
            const active = hover === i;
            return (
              <button
                key={d.date}
                type="button"
                className="group relative flex h-full flex-1 items-end focus:outline-none"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${dayFormat.format(new Date(`${d.date}T00:00:00Z`))}: ${d.leads} leads`}
              >
                <span
                  className="w-full rounded-t-[4px] transition-opacity"
                  style={{
                    height: `${(d.leads / top) * 100}%`,
                    minHeight: d.leads ? 3 : 0,
                    background: isToday ? "var(--ps-aqua-500)" : "var(--ps-mark)",
                    opacity: hover === null || active ? 1 : 0.45,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] pr-6 text-[10px] tabular-nums text-[var(--ps-ink-3)] sm:gap-1">
        {daily.map((d, i) => (
          <span key={d.date} className="flex-1 text-center">
            {i === daily.length - 1 ? "Today" : i % 2 === 1 ? "" : dayNum.format(new Date(`${d.date}T00:00:00Z`))}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Leads per day</caption>
        <tbody>
          {daily.map((d) => (
            <tr key={d.date}>
              <th>{d.date}</th>
              <td>{d.leads}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** This week's leads by source, one hue, sorted; last week's count beside each. */
function SourceBars({ rows }: { rows: { source: keyof typeof SOURCE_LABELS; thisWeek: number; lastWeek: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.thisWeek, r.lastWeek)));
  if (rows.length === 0) return <p className="text-sm text-[var(--ps-ink-3)]">No leads this week or last.</p>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.source}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-[var(--ps-ink)]">{SOURCE_LABELS[r.source]}</span>
            <span className="tabular-nums">
              <span className="font-semibold text-[var(--ps-ink)]">{r.thisWeek}</span>
              <span className="text-xs text-[var(--ps-ink-3)]"> · last wk {r.lastWeek}</span>
            </span>
          </div>
          <div className="relative h-2.5 rounded-full bg-[var(--ps-tint-50)]" title={`${SOURCE_LABELS[r.source]}: ${r.thisWeek} this week, ${r.lastWeek} last week`}>
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.thisWeek / max) * 100}%`, background: "var(--ps-mark)" }} />
            {/* Last week as a thin tick, so the comparison needs no second color */}
            <span className="absolute -top-0.5 -bottom-0.5 w-[2px] rounded bg-[var(--ps-ink-3)]" style={{ left: `calc(${(r.lastWeek / max) * 100}% - 1px)` }} aria-hidden />
          </div>
        </li>
      ))}
      <li className="flex items-center gap-2 pt-1 text-[11px] text-[var(--ps-ink-3)]">
        <span className="inline-block h-2 w-4 rounded-full" style={{ background: "var(--ps-mark)" }} /> this week so far
        <span className="ml-2 inline-block h-3 w-[2px] rounded bg-[var(--ps-ink-3)]" /> last week, same point
      </li>
    </ul>
  );
}

const STAGE_LABELS = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", QUOTED: "Quoted" } as const;

/** Active pipeline as a stepped funnel: one blue, darker as leads move closer to a sale. */
function Funnel({ stages }: { stages: { status: keyof typeof STAGE_LABELS; leads: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.leads));
  const total = stages.reduce((n, s) => n + s.leads, 0);
  return (
    <ol className="space-y-2.5">
      {stages.map((s, i) => (
        <li key={s.status} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-sm">
          <Link href={`/leads?status=${s.status}`} className="font-medium text-[var(--ps-ink)] hover:underline">
            {STAGE_LABELS[s.status]}
          </Link>
          <span className="h-7 rounded-md bg-[var(--ps-tint-50)]">
            <span className="block h-full rounded-md" style={{ width: `${Math.max(4, (s.leads / max) * 100)}%`, background: `var(--ps-stage-${i + 1})` }} />
          </span>
          <span className="text-right tabular-nums">
            <span className="font-semibold text-[var(--ps-ink)]">{s.leads}</span>
            <span className="block text-[11px] text-[var(--ps-ink-3)]">{total ? Math.round((s.leads / total) * 100) : 0}%</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// --- Panels --------------------------------------------------------------------------

/** One row per person, worst first, each issue a chip. Red only where it's urgent. */
function Attention({ flags }: { flags: Flag[] }) {
  const people = useMemo(() => {
    const byPerson = new Map<string, { name: string; role: string; items: Flag[]; high: boolean }>();
    for (const f of flags) {
      const p = byPerson.get(f.personId) ?? { name: f.person, role: f.role, items: [], high: false };
      p.items.push(f);
      p.high ||= f.severity === "high";
      byPerson.set(f.personId, p);
    }
    return [...byPerson.entries()].sort((a, b) => Number(b[1].high) - Number(a[1].high) || b[1].items.length - a[1].items.length);
  }, [flags]);

  if (people.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-6 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        <CheckCircle2 className="size-5" aria-hidden /> Everyone is on top of their leads.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[var(--ps-line)]">
      {people.map(([id, p]) => (
        <li key={id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
          <Avatar name={p.name} />
          <span className="min-w-[8rem] flex-1">
            <span className="block text-sm font-semibold text-[var(--ps-ink)]">{p.name}</span>
            <span className="text-xs text-[var(--ps-ink-3)]">{p.role}</span>
          </span>
          <span className="flex flex-wrap justify-end gap-1.5">
            {p.items.map((f, i) => (
              <Link
                key={i}
                href={f.href}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  f.severity === "high"
                    ? "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-900"
                    : "bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900"
                }`}
              >
                {f.severity === "high" ? <TriangleAlert className="size-3" aria-hidden /> : <AlarmClock className="size-3" aria-hidden />}
                {f.message}
              </Link>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
      <CheckCircle2 className="size-3" aria-hidden /> On track
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
      <AlarmClock className="size-3" aria-hidden /> {label}
    </span>
  );
}

function MiniBar({ value }: { value: number | null }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-14 rounded-full bg-[var(--ps-tint-50)]">
        <span className="block h-full rounded-full" style={{ width: `${Math.round((value ?? 0) * 100)}%`, background: "var(--ps-mark)" }} />
      </span>
      <span className="w-9 text-right tabular-nums">{percent(value)}</span>
    </span>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ps-ink-3)]";
const td = "px-3 py-2.5 align-middle";

function Leaderboard({ data }: { data: MasterDashboardData }) {
  const [tab, setTab] = useState<"telecallers" | "sales">("telecallers");
  const telecallers = [...data.telecallers].sort((a, b) => b.callsWeek - a.callsWeek || b.qualifiedMonth - a.qualifiedMonth);
  const sales = [...data.sales].sort((a, b) => Number(b.revenueMonth) - Number(a.revenueMonth) || b.wonMonth - a.wonMonth);
  return (
    <Panel
      title="Team leaderboard"
      subtitle={tab === "telecallers" ? "Ranked by calls this week. Slipping = new leads waiting or callbacks overdue." : "Ranked by revenue this month. Slipping = follow-ups overdue or deals with no next step."}
      action={
        <div className="flex rounded-lg bg-[var(--ps-tint-50)] p-0.5 text-xs font-semibold" role="tablist">
          {(["telecallers", "sales"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 capitalize ${tab === t ? "bg-[var(--ps-card)] text-[var(--ps-ink)] shadow-sm" : "text-[var(--ps-ink-2)]"}`}
            >
              {t === "telecallers" ? "Telecallers" : "Sales"}
            </button>
          ))}
        </div>
      }
    >
      <div className="-mx-2 overflow-x-auto">
        {tab === "telecallers" ? (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--ps-line)]">
                <th className={th}>#</th>
                <th className={th}>Telecaller</th>
                <th className={`${th} text-right`}>Calls today</th>
                <th className={`${th} text-right`}>Calls / week</th>
                <th className={`${th} text-right`}>Qualified (mo)</th>
                <th className={th}>Conversion</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ps-line)]">
              {telecallers.map((r, i) => {
                const slipping = r.notCalled > 0 || r.overdueCallbacks > 0;
                return (
                  <tr key={r.id}>
                    <td className={`${td} w-8 font-semibold tabular-nums text-[var(--ps-ink-3)]`}>{i + 1}</td>
                    <td className={td}>
                      <Link href={`/leads?assignedToId=${r.id}`} className="flex items-center gap-2.5 font-medium text-[var(--ps-ink)] hover:underline">
                        <Avatar name={r.fullName} /> {r.fullName}
                      </Link>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{r.callsToday}</td>
                    <td className={`${td} text-right font-semibold tabular-nums text-[var(--ps-ink)]`}>{r.callsWeek}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.qualifiedMonth}</td>
                    <td className={td}>
                      <MiniBar value={r.conversionRate} />
                    </td>
                    <td className={td}>
                      <StatusPill ok={!slipping} label={r.notCalled > 0 ? `${r.notCalled} waiting` : `${r.overdueCallbacks} overdue`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--ps-line)]">
                <th className={th}>#</th>
                <th className={th}>Salesperson</th>
                <th className={`${th} text-right`}>Revenue (mo)</th>
                <th className={`${th} text-right`}>Won (mo)</th>
                <th className={`${th} text-right`}>Open deals</th>
                <th className={th}>Follow-ups done</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ps-line)]">
              {sales.map((r, i) => {
                const slipping = r.followUpsOverdue > 0 || r.noNextStep > 0;
                return (
                  <tr key={r.id}>
                    <td className={`${td} w-8 font-semibold tabular-nums text-[var(--ps-ink-3)]`}>{i + 1}</td>
                    <td className={td}>
                      <Link href={`/leads?assignedToId=${r.id}`} className="flex items-center gap-2.5 font-medium text-[var(--ps-ink)] hover:underline">
                        <Avatar name={r.fullName} /> {r.fullName}
                      </Link>
                    </td>
                    <td className={`${td} text-right font-semibold tabular-nums text-[var(--ps-ink)]`} title={formatINR(r.revenueMonth)}>
                      {formatINRShort(r.revenueMonth)}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{r.wonMonth}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.open}</td>
                    <td className={td}>
                      <MiniBar value={r.followUpCompliance} />
                    </td>
                    <td className={td}>
                      <StatusPill ok={!slipping} label={r.followUpsOverdue > 0 ? `${r.followUpsOverdue} overdue` : `${r.noNextStep} no next step`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}

// --- Page --------------------------------------------------------------------------------

const longDate = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** The owner's morning dashboard: the five numbers that matter, then who to talk to. */
export function CeoDashboard() {
  const { user, operations } = useAuth();
  const { data, error } = useApi<MasterDashboardData>("/dashboards/master");
  const [now] = useState(() => new Date());
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const o = data?.overview;
  const attentionCount = data ? data.team.notCalled + data.team.overdue : 0;

  return (
    <div className="space-y-6">
      {/* Hero band: brand, greeting, the day in one line */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--ps-navy-950)] via-[var(--ps-navy-900)] to-[var(--ps-ocean-700)] px-6 py-7 text-white shadow-[0_20px_50px_-24px_rgba(7,26,51,0.7)] sm:px-8">
        {/* Water-line motif: two soft arcs */}
        <svg className="pointer-events-none absolute -right-16 -bottom-24 h-72 w-[34rem] opacity-25" viewBox="0 0 540 280" aria-hidden>
          <path d="M0 160 C 120 110, 240 210, 360 160 S 540 120, 540 120 V280 H0Z" fill="var(--ps-aqua-500)" />
          <path d="M0 200 C 140 150, 260 250, 400 200 S 540 170, 540 170 V280 H0Z" fill="#ffffff" opacity="0.35" />
        </svg>
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
              <ShieldCheck className="size-4" aria-hidden /> Precon Sump
              <span className="hidden font-normal tracking-[0.1em] text-sky-200/70 sm:inline">· Strong · Reliable · Built to last</span>
            </p>
            <h1 className="mt-3 text-[28px] leading-tight font-bold tracking-tight sm:text-4xl">
              {greeting}, {user.fullName.split(" ")[0]}
            </h1>
            <p className="mt-1.5 text-sm text-sky-100/80">{longDate.format(now)}</p>
          </div>
          {data && o && (
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-white/15 text-center backdrop-blur-sm">
              {[
                { label: "Leads this week", value: o.leadFlow.thisWeek.toLocaleString("en-IN") },
                { label: "Revenue MTD", value: formatINRShort(o.revenue.monthToDate) },
                { label: "Need attention", value: attentionCount.toLocaleString("en-IN") },
              ].map((x) => (
                <div key={x.label} className="bg-[var(--ps-navy-950)]/40 px-3 py-3 sm:px-6">
                  <div className="text-lg font-bold whitespace-nowrap tabular-nums sm:text-2xl">{x.value}</div>
                  <div className="text-[11px] text-sky-100/75">{x.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <ErrorText error={error} />
      {!data && !error && <p className="text-sm text-[var(--ps-ink-3)]">Loading today&apos;s numbers…</p>}

      {data && o && (
        <>
          {/* The five things that matter, most important first */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-5 lg:[&>*]:col-span-2 lg:[&>*:nth-child(n+4)]:col-span-3 xl:[&>*]:col-span-1 xl:[&>*:nth-child(n+4)]:col-span-1">
            <Kpi
              label="Lead flow"
              icon={Inbox}
              href="/admin/lead-assignment"
              value={o.leadFlow.thisWeek.toLocaleString("en-IN")}
              delta={<Delta now={o.leadFlow.thisWeek} before={o.leadFlow.lastWeekSameTime} label="last week" />}
              foot={`This week · ${o.leadFlow.today} today, ${o.leadFlow.yesterday} yesterday`}
            />
            <Kpi
              label="Team activity"
              icon={PhoneCall}
              href="/reports"
              value={o.activity.callsToday.toLocaleString("en-IN")}
              delta={<Delta now={o.activity.callsToday} before={o.activity.callsYesterdaySoFar} label="by this time yesterday" />}
              foot={`Calls today · ${o.activity.leadsWorkedToday} leads worked · follow-ups ${percent(o.activity.followUpCompliance)} done this month`}
            />
            <Kpi
              label="Active pipeline"
              icon={Gauge}
              href="/leads"
              value={o.pipeline.active.toLocaleString("en-IN")}
              foot={`Open leads, all stages · ${data.team.qualifiedToday} qualified today (${o.pipeline.qualifiedYesterday} yesterday)`}
            />
            <Kpi
              label="Revenue · MTD"
              icon={IndianRupee}
              href="/reports"
              value={<span title={formatINR(o.revenue.monthToDate)}>{formatINRShort(o.revenue.monthToDate)}</span>}
              delta={<Delta now={Number(o.revenue.monthToDate)} before={Number(o.revenue.lastMonthSameDays)} label="same days last month" money />}
              foot={`${o.revenue.wonMonthToDate} won (${o.revenue.wonLastMonthSameDays} same days last month) · last month ${formatINRShort(o.revenue.lastMonthTotal)}`}
            />
            <Kpi
              label="Needs attention"
              icon={BellRing}
              href="#attention"
              urgent={attentionCount > 0}
              value={attentionCount.toLocaleString("en-IN")}
              foot={`${data.team.overdue} overdue callbacks & follow-ups · ${data.team.notCalled} new leads not called`}
            />
          </div>

          {/* Lead flow detail */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Incoming leads" subtitle="Per day, last 14 days" className="lg:col-span-2" action={<PanelLink href="/leads">All leads</PanelLink>}>
              <LeadTrend daily={o.leadFlow.daily} />
            </Panel>
            <Panel title="Leads by source" subtitle="This week so far vs the same point last week">
              <SourceBars rows={o.leadFlow.bySource} />
            </Panel>
          </div>

          {/* Who needs a nudge, and where the pipeline stands */}
          <div className="grid gap-4 lg:grid-cols-5">
            <div id="attention" className="scroll-mt-6 lg:col-span-3">
              <Panel title="Needs your attention" subtitle="Worst first. Tap an item to open that person's leads." className="h-full">
                <Attention flags={data.flags} />
              </Panel>
            </div>
            <Panel
              title="Pipeline by stage"
              subtitle={`${o.pipeline.active} open leads`}
              className="lg:col-span-2"
              action={<PanelLink href="/reports">Reports</PanelLink>}
            >
              <Funnel stages={o.pipeline.stages} />
              <div className="mt-5 border-t border-[var(--ps-line)] pt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold uppercase tracking-[0.06em] text-[var(--ps-ink-3)]">Today&apos;s leads by telecaller</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      data.today.spread <= 1
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                    }`}
                  >
                    {data.today.spread <= 1 ? "Even split ✓" : `Off by ${data.today.spread}`}
                  </span>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {data.today.members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between">
                      <span className={m.autoAssignEnabled ? "text-[var(--ps-ink-2)]" : "text-[var(--ps-ink-3)] line-through"}>{m.fullName}</span>
                      <span className="font-semibold tabular-nums text-[var(--ps-ink)]">{m.leads}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>

          <Leaderboard data={data} />

          <Panel title="Sales site visits" subtitle="GPS check-ins, last 30 days" action={<PanelLink href="/site-visits">All visits</PanelLink>}>
            <VisitsMap visits={data.visits} height={380} />
          </Panel>

          <MyReminders hideWhenEmpty />

          {operations && (
            <p className="text-xs text-[var(--ps-ink-3)]">
              Finance, stock, service and HR:{" "}
              <Link href="/admin/overview" className="font-semibold text-[var(--ps-blue-600)] hover:underline">
                Admin → Business overview
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
