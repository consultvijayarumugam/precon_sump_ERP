"use client";

import { BellRing, CheckCircle2, Inbox, IndianRupee, PhoneCall, Shuffle, Sparkles, TriangleAlert, Trophy } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { VisitsMap } from "@/components/check-in";
import { Badge, ErrorText, panelClass, tableClass, tableWrapClass, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { formatINR } from "@/lib/finance";
import { useApi } from "@/lib/use-api";
import { MasterDashboardData, percent } from "@/lib/workflow";
import { MyReminders } from "./my-reminders";
import { EmptyNote, Greeting, KpiTile, SectionHeader } from "./shared";

/** A table cell that turns red when there's something to chase. */
function Cell({ value, bad, children }: { value: number; bad?: boolean; children?: ReactNode }) {
  return (
    <td className={`${tdClass} text-right tabular-nums ${bad && value > 0 ? "bg-red-50 font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300" : ""}`}>
      {children ?? value}
    </td>
  );
}

const waited = (iso: string | null) => {
  if (!iso) return "";
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return hours >= 24 ? `${Math.floor(hours / 24)}d` : hours >= 1 ? `${hours}h` : "<1h";
};

/** Admin landing page: everyone's numbers side by side, who is slipping, today's split, site visits. */
export function MasterDashboard() {
  const { operations } = useAuth();
  const { data, error } = useApi<MasterDashboardData>("/dashboards/master");
  const t = data?.team;
  const maxToday = Math.max(1, ...(data?.today.members.map((m) => m.leads) ?? [1]));

  return (
    <div className="space-y-7">
      <Greeting subtitle="Telecalling and sales at a glance: today's leads, who is keeping up, and where the team has been." />
      <ErrorText error={error} />
      <MyReminders />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiTile label="Leads in today" value={t?.incomingToday} href="/admin/lead-assignment" icon={Inbox} module="crm" />
        <KpiTile label="Calls logged today" value={t?.callsToday} href="/follow-ups" icon={PhoneCall} module="crm" />
        <KpiTile label="New leads not called" value={t?.notCalled} href="/leads?status=NEW" icon={BellRing} module="crm" alert={(t?.notCalled ?? 0) > 0} />
        <KpiTile label="Overdue callbacks & follow-ups" value={t?.overdue} href="/follow-ups" icon={TriangleAlert} module="crm" alert={(t?.overdue ?? 0) > 0} />
        <KpiTile label="Qualified today" value={t?.qualifiedToday} href="/leads?status=QUALIFIED" icon={Sparkles} module="crm" />
        <KpiTile
          label="Won this month"
          value={t?.wonMonth}
          href="/leads/won"
          icon={Trophy}
          module="finance"
          hint={t && <span className="inline-flex items-center gap-1"><IndianRupee className="size-3" aria-hidden />{formatINR(t.revenueMonth)} revenue</span>}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionHeader title="Needs attention today" module="crm" />
          {data && data.flags.length === 0 ? (
            <EmptyNote>
              <CheckCircle2 className="mr-1 inline size-4 text-emerald-600" aria-hidden /> Everyone is on top of their leads.
            </EmptyNote>
          ) : (
            <ul className={`${panelClass} divide-y divide-neutral-100 overflow-hidden dark:divide-neutral-800`}>
              {data?.flags.map((f, i) => (
                <li key={`${f.personId}-${i}`}>
                  <Link href={f.href} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <span className={`size-2.5 shrink-0 rounded-full ${f.severity === "high" ? "bg-red-600" : "bg-amber-500"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{f.person}</span>
                      <span className="ml-2 text-xs text-neutral-500">{f.role}</span>
                      <span className={`block text-sm ${f.severity === "high" ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>{f.message}</span>
                    </span>
                    <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-2">
          <SectionHeader title="Today's leads by telecaller" module="crm" href="/admin/lead-assignment" linkLabel="Assignment" />
          <div className={`${panelClass} space-y-3 p-4`}>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tabular-nums">{data?.today.total ?? "–"}</span>
              {data && (
                <Badge tone={data.today.spread <= 1 ? "green" : "amber"}>
                  {data.today.spread <= 1 ? "Even split ✓" : `Off by ${data.today.spread}`}
                </Badge>
              )}
            </div>
            <ul className="space-y-2">
              {data?.today.members.map((m) => (
                <li key={m.id} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className={`truncate font-medium ${m.autoAssignEnabled ? "" : "text-neutral-400 line-through"}`}>{m.fullName}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(m.leads / maxToday) * 100}%` }} />
                  </span>
                  <span className="text-right font-bold tabular-nums">{m.leads}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-1.5 text-xs text-neutral-500">
              <Shuffle className="size-3.5" aria-hidden />
              {data?.today.nextUp ? `Next lead goes to ${data.today.nextUp.fullName}` : "Nobody is switched on for new leads"}
              {data && data.today.unassigned > 0 && ` · ${data.today.unassigned} unassigned`}
            </p>
          </div>
        </section>
      </div>

      <section>
        <SectionHeader title="Telecaller scorecard" module="crm" />
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Telecaller</th>
                <th className={`${thClass} text-right`}>Leads today</th>
                <th className={`${thClass} text-right`}>Active leads</th>
                <th className={`${thClass} text-right`}>Not called yet</th>
                <th className={`${thClass} text-right`}>Overdue callbacks</th>
                <th className={`${thClass} text-right`}>Calls today</th>
                <th className={`${thClass} text-right`}>Calls this week</th>
                <th className={`${thClass} text-right`}>Qualified (month)</th>
                <th className={`${thClass} text-right`} title="Of the leads received this month, the share qualified so far">
                  Conversion
                </th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {data?.telecallers.map((r) => (
                <tr key={r.id}>
                  <td className={tdClass}>
                    <Link href={`/leads?assignedToId=${r.id}`} className="font-medium hover:text-brand-700">
                      {r.fullName}
                    </Link>
                    {!r.inRotation && <div className="text-xs text-neutral-500">not taking new leads</div>}
                  </td>
                  <Cell value={r.receivedToday} />
                  <Cell value={r.active} />
                  <Cell value={r.notCalled} bad>
                    {r.notCalled}
                    {r.notCalled > 0 && r.oldestNotCalledAt && <span className="block text-xs font-medium">oldest {waited(r.oldestNotCalledAt)}</span>}
                  </Cell>
                  <Cell value={r.overdueCallbacks} bad />
                  <Cell value={r.callsToday} />
                  <Cell value={r.callsWeek} />
                  <Cell value={r.qualifiedMonth} />
                  <td className={`${tdClass} text-right font-semibold tabular-nums`}>
                    {percent(r.conversionRate)}
                    <span className="block text-xs font-normal text-neutral-500">of {r.receivedMonth} received</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeader title="Sales scorecard" module="crm" />
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Salesperson</th>
                <th className={`${thClass} text-right`}>Qualified received (month)</th>
                <th className={`${thClass} text-right`}>Open pipeline</th>
                <th className={`${thClass} text-right`}>Won (month)</th>
                <th className={`${thClass} text-right`}>Revenue (month)</th>
                <th className={`${thClass} text-right`}>Follow-ups overdue</th>
                <th className={`${thClass} text-right`}>No follow-up planned</th>
                <th className={`${thClass} text-right`} title="Follow-ups due this month (up to now) that have been done">
                  Follow-up compliance
                </th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {data?.sales.map((r) => (
                <tr key={r.id}>
                  <td className={tdClass}>
                    <Link href={`/leads?assignedToId=${r.id}`} className="font-medium hover:text-brand-700">
                      {r.fullName}
                    </Link>
                    {!r.inRotation && <div className="text-xs text-neutral-500">not taking new leads</div>}
                  </td>
                  <Cell value={r.receivedMonth} />
                  <Cell value={r.open} />
                  <Cell value={r.wonMonth} />
                  <td className={`${tdClass} text-right font-semibold tabular-nums`}>{formatINR(r.revenueMonth)}</td>
                  <Cell value={r.followUpsOverdue} bad />
                  <Cell value={r.noNextStep} bad />
                  <td
                    className={`${tdClass} text-right font-semibold tabular-nums ${
                      r.followUpCompliance !== null && r.followUpCompliance < 0.8 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {percent(r.followUpCompliance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeader title="Sales site visits (last 30 days)" module="operations" href="/site-visits" />
        <div className={`${panelClass} p-3`}>{data && <VisitsMap visits={data.visits} height={420} />}</div>
      </section>

      {operations && (
        <p className="text-xs text-neutral-500">
          Finance, stock, service and HR are under{" "}
          <Link href="/admin/overview" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Admin → Business overview
          </Link>
          .
        </p>
      )}
    </div>
  );
}
