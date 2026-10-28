"use client";

import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Badge,
  ErrorText,
  NoAccess,
  PageHeader,
  panelClass,
  secondaryButtonSmClass,
  Stat,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { apiPatch } from "@/lib/api";
import { dayKey, formatDateTime } from "@/lib/crm";
import { addDaysToDate } from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

interface Distribution {
  date: string;
  total: number;
  autoAssigned: number;
  unassigned: number;
  spread: number;
  nextUp: { id: string; fullName: string } | null;
  members: {
    id: string;
    fullName: string;
    email: string;
    autoAssignEnabled: boolean;
    lastAutoAssignedAt: string | null;
    leads: number;
  }[];
  /** Salespeople receiving the leads telecallers qualify (their own round-robin). */
  sales: {
    nextUp: { id: string; fullName: string } | null;
    members: { id: string; fullName: string; email: string; autoAssignEnabled: boolean; lastAutoAssignedAt: string | null }[];
  };
  others: { id: string; fullName: string; role: string; leads: number }[];
}

/** On/off switch for someone's place in a rotation. */
function RotationSwitch({ name, enabled, busy, onToggle }: { name: string; enabled: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${name} receives new leads`}
        disabled={busy}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          enabled ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"
        }`}
      >
        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
      <span className="ml-2 text-xs text-neutral-500">{enabled ? "On" : "Off (skipped)"}</span>
    </>
  );
}

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

/** Admin view: a day's incoming leads and how the round-robin shared them across the telecallers. */
export default function LeadAssignmentPage() {
  const { can } = useAuth();
  const today = dayKey(new Date());
  const [date, setDate] = useState(today);
  const { data, error, reload } = useApi<Distribution>(`/lead-assignment?date=${date}`);
  const toggle = useAction();
  if (!can(TAGS.LEADS_ASSIGN)) return <NoAccess tag={TAGS.LEADS_ASSIGN} />;

  async function setEnabled(userId: string, enabled: boolean) {
    if (await toggle.run(() => apiPatch(`/lead-assignment/members/${userId}`, { enabled }))) reload();
  }

  const isToday = date === today;
  const rotationSize = data?.members.filter((m) => m.autoAssignEnabled).length ?? 0;
  const maxLeads = Math.max(1, ...(data?.members.map((m) => m.leads) ?? []), ...(data?.others.map((o) => o.leads) ?? []));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead assignment"
        subtitle="New leads from imports, the API and Meta are shared round-robin across the telecallers who are switched on; qualified leads are shared across the salespeople. Check the split here and switch people in or out."
        action={
          <div className="flex items-center gap-1">
            <button type="button" className={secondaryButtonSmClass} onClick={() => setDate(addDaysToDate(date, -1))} aria-label="Previous day">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <input
              type="date"
              className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button
              type="button"
              className={secondaryButtonSmClass}
              onClick={() => setDate(addDaysToDate(date, 1))}
              disabled={isToday}
              aria-label="Next day"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
            {!isToday && (
              <button type="button" className={secondaryButtonSmClass} onClick={() => setDate(today)}>
                Today
              </button>
            )}
          </div>
        }
      />

      <ErrorText error={error ?? toggle.error} />
      {data && (
        <>
          <section className={`${panelClass} grid gap-6 p-5 sm:grid-cols-4`}>
            <Stat label={isToday ? "Today's leads" : `Leads on ${dayLabel(date)}`} value={data.total} />
            <Stat label="Given to telecallers" value={data.autoAssigned} />
            <Stat label="Unassigned" value={data.unassigned} tone={data.unassigned > 0 ? "alert" : undefined} />
            <div>
              <div className="flex items-center gap-2 text-2xl font-bold tracking-tight tabular-nums">
                {data.spread <= 1 ? "Even" : `Off by ${data.spread}`}
                <Badge tone={data.spread <= 1 ? "green" : "amber"}>{data.spread <= 1 ? "✓" : "check"}</Badge>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                Split (most minus fewest among those switched on). A difference of 1 is normal mid-rotation.
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <Shuffle className="size-4 text-brand-600" aria-hidden /> Telecallers in the rotation
              </h2>
              {data.nextUp && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Next lead goes to <strong>{data.nextUp.fullName}</strong>
                </p>
              )}
            </div>
            {rotationSize === 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Nobody is switched on, so new leads arrive unassigned. Switch at least one telecaller on.
              </p>
            )}
            <div className={tableWrapClass}>
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>Telecaller</th>
                    <th className={thClass}>Receives new leads</th>
                    <th className={thClass}>{isToday ? "Leads today" : "Leads that day"}</th>
                    <th className={thClass}>Last round-robin lead</th>
                    <th className={thClass}></th>
                  </tr>
                </thead>
                <tbody className={tbodyClass}>
                  {data.members.length === 0 && (
                    <tr>
                      <td className={`${tdClass} text-neutral-500`} colSpan={5}>
                        No one holds the <code>leads.auto_assign</code> tag. Telecallers get it from their role preset.
                      </td>
                    </tr>
                  )}
                  {data.members.map((m) => (
                    <tr key={m.id} className={m.autoAssignEnabled ? undefined : "opacity-60"}>
                      <td className={tdClass}>
                        <div className="font-medium">
                          {m.fullName}
                          {data.nextUp?.id === m.id && (
                            <span className="ml-2">
                              <Badge tone="blue">next</Badge>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500">{m.email}</div>
                      </td>
                      <td className={tdClass}>
                        <RotationSwitch
                          name={m.fullName}
                          enabled={m.autoAssignEnabled}
                          busy={toggle.busy}
                          onToggle={() => setEnabled(m.id, !m.autoAssignEnabled)}
                        />
                      </td>
                      <td className={`${tdClass} w-1/3`}>
                        <div className="flex items-center gap-3">
                          <span className="w-8 text-right text-base font-bold tabular-nums">{m.leads}</span>
                          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(m.leads / maxLeads) * 100}%` }} />
                          </span>
                        </div>
                      </td>
                      <td className={tdClass}>{m.lastAutoAssignedAt ? formatDateTime(m.lastAutoAssignedAt) : "Never"}</td>
                      <td className={`${tdClass} text-right`}>
                        <Link href={`/leads?assignedToId=${m.id}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                          Their leads →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <Shuffle className="size-4 text-emerald-600" aria-hidden /> Salespeople receiving qualified leads
              </h2>
              {data.sales.nextUp && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Next qualified lead goes to <strong>{data.sales.nextUp.fullName}</strong>
                </p>
              )}
            </div>
            {data.sales.members.length > 0 && data.sales.members.every((m) => !m.autoAssignEnabled) && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                No salesperson is switched on, so telecallers must pick someone by name when they qualify a lead.
              </p>
            )}
            <div className={tableWrapClass}>
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>Salesperson</th>
                    <th className={thClass}>Receives qualified leads</th>
                    <th className={thClass}>Last round-robin lead</th>
                    <th className={thClass}></th>
                  </tr>
                </thead>
                <tbody className={tbodyClass}>
                  {data.sales.members.length === 0 && (
                    <tr>
                      <td className={`${tdClass} text-neutral-500`} colSpan={4}>
                        No one holds the <code>leads.receive_qualified</code> tag. Salespeople get it from their role preset.
                      </td>
                    </tr>
                  )}
                  {data.sales.members.map((m) => (
                    <tr key={m.id} className={m.autoAssignEnabled ? undefined : "opacity-60"}>
                      <td className={tdClass}>
                        <div className="font-medium">
                          {m.fullName}
                          {data.sales.nextUp?.id === m.id && (
                            <span className="ml-2">
                              <Badge tone="blue">next</Badge>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500">{m.email}</div>
                      </td>
                      <td className={tdClass}>
                        <RotationSwitch
                          name={m.fullName}
                          enabled={m.autoAssignEnabled}
                          busy={toggle.busy}
                          onToggle={() => setEnabled(m.id, !m.autoAssignEnabled)}
                        />
                      </td>
                      <td className={tdClass}>{m.lastAutoAssignedAt ? formatDateTime(m.lastAutoAssignedAt) : "Never"}</td>
                      <td className={`${tdClass} text-right`}>
                        <Link href={`/leads?assignedToId=${m.id}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                          Their leads →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.others.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-bold tracking-tight">Also assigned that day (by hand)</h2>
              <ul className={`${panelClass} divide-y divide-neutral-100 px-4 text-sm dark:divide-neutral-800`}>
                {data.others.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2">
                    <span>
                      <span className="font-medium">{o.fullName}</span> <span className="text-neutral-500">({o.role})</span>
                    </span>
                    <span className="font-semibold tabular-nums">{o.leads}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${panelClass} space-y-2 p-5 text-sm text-neutral-600 dark:text-neutral-400`}>
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">How it works</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Every new lead from an import, the API or Meta without a chosen person goes to the telecaller who has waited longest:
                A, B, C, A, B, C… across uploads and through the day.
              </li>
              <li>Duplicates (phone already a lead) are skipped and don&apos;t use up a turn.</li>
              <li>
                When a telecaller qualifies a lead, it goes to the salesperson who has waited longest (or to the person the telecaller
                picks). Switch a salesperson off to skip them.
              </li>
              <li>Switch someone off for leave or a day off; they&apos;re skipped until switched back on, then rejoin the rotation.</li>
              <li>
                To move a single lead, open it and change &ldquo;Assigned to&rdquo;. Leads typed in by hand on &ldquo;New lead&rdquo; are not
                part of the rotation.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
