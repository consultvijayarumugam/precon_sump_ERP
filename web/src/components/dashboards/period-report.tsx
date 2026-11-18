"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DASHBOARD_PRESETS, DateRangeFilter, presetRange, type DateRange } from "@/components/date-range-filter";
import { ErrorText, panelClass, tableClass, tableWrapClass, tbodyClass, tdClass, thClass, theadClass } from "@/components/ui";
import { queryString } from "@/lib/api";
import { SOURCE_LABELS, type LeadSource } from "@/lib/crm";
import { pct, periodTiles, rupees, talk, type PeriodReportData } from "@/lib/period-report";
import { useApi } from "@/lib/use-api";

/**
 * "Results for a period": the dashboard's numbers for Today, This week, This
 * month (default), Last month or a custom range. Admins see the team, a row
 * per person and leads by source; everyone else only their own numbers.
 */
export function PeriodReport({ title }: { title: string }) {
  const { operations } = useAuth();
  const [range, setRange] = useState<DateRange>(() => presetRange("month"));
  const { data, error } = useApi<PeriodReportData>(`/dashboards/period${queryString({ from: range.from, to: range.to })}`);
  const tiles = data ? periodTiles(data, { showRevenue: operations }) : [];
  const showRevenue = operations && data?.totals.revenue !== null;

  return (
    <section aria-labelledby="period-report" className="space-y-3">
      <h2 id="period-report" className="text-lg font-bold tracking-tight">
        {title}
      </h2>
      <DateRangeFilter value={range} onChange={setRange} noun={["", ""]} presets={DASHBOARD_PRESETS} />
      <ErrorText error={error} />
      {!data && !error && <p className="text-sm text-neutral-500">Loading…</p>}
      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="period-tiles">
          {tiles.map((t) => (
            <div key={t.key} className={`${panelClass} p-4`}>
              <p className="text-2xl font-bold tracking-tight tabular-nums">{t.value}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.label}</p>
              {t.hint && <p className="mt-0.5 text-xs text-neutral-500">{t.hint}</p>}
            </div>
          ))}
        </div>
      )}

      {data?.people && data.people.length > 0 && (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Person</th>
                <th className={thClass}>Leads in</th>
                <th className={thClass}>Calls (leads)</th>
                <th className={thClass}>Qualified</th>
                <th className={thClass}>Won / lost</th>
                {showRevenue && <th className={thClass}>Revenue</th>}
                <th className={thClass}>Follow-ups on time</th>
                <th className={thClass}>Talk-time</th>
                <th className={thClass}>Site visits</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {data.people.map((p) => (
                <tr key={`${p.kind}-${p.id}`}>
                  <td className={tdClass}>
                    <span className="font-medium">{p.fullName}</span>
                    <span className="block text-xs text-neutral-500">{p.kind === "telecaller" ? "Telecaller" : "Sales"}</span>
                  </td>
                  <td className={`${tdClass} tabular-nums`}>{p.leadsIn}</td>
                  <td className={`${tdClass} tabular-nums`}>
                    {p.callsLogged} <span className="text-neutral-500">({p.leadsCalled})</span>
                  </td>
                  <td className={`${tdClass} tabular-nums`}>{p.qualified === null ? "–" : `${p.qualified} · ${pct(p.conversionRate)}`}</td>
                  <td className={`${tdClass} tabular-nums`}>
                    {p.won} / {p.lost}
                  </td>
                  {showRevenue && <td className={`${tdClass} tabular-nums`}>{p.revenue === null ? "–" : rupees(p.revenue)}</td>}
                  <td className={`${tdClass} tabular-nums`}>
                    {pct(p.followUpCompliance)} <span className="text-neutral-500">({p.followUpsDone}/{p.followUpsDue})</span>
                  </td>
                  <td className={`${tdClass} tabular-nums`}>{talk(p.talkSeconds)}</td>
                  <td className={`${tdClass} tabular-nums`}>{p.kind === "sales" ? p.siteVisits : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.bySource && data.bySource.length > 0 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          <span className="font-medium text-neutral-900 dark:text-neutral-100">New leads by source: </span>
          {data.bySource.map((s) => `${SOURCE_LABELS[s.source as LeadSource] ?? s.source} ${s.leads}`).join(" · ")}
        </p>
      )}
    </section>
  );
}
