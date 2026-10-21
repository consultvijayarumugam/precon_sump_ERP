"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  PageHeader,
  secondaryButtonCompactClass,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { queryString } from "@/lib/api";
import { dayKey, UserRef } from "@/lib/crm";
import { formatINR } from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

interface RevenueRow {
  salesperson: UserRef;
  orders: number;
  revenue: string;
  collected: string;
  outstanding: string;
}
interface RevenueReport {
  from: string | null;
  to: string | null;
  rows: RevenueRow[];
  totals: Omit<RevenueRow, "salesperson">;
}

/** Date-range presets in local time. Indian financial year starts 1 April. */
function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fyStart = m >= 3 ? y : y - 1;
  return {
    "This month": { from: dayKey(new Date(y, m, 1)), to: dayKey(new Date(y, m + 1, 0)) },
    "Last month": { from: dayKey(new Date(y, m - 1, 1)), to: dayKey(new Date(y, m, 0)) },
    "This financial year": { from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31` },
    "All time": { from: "", to: "" },
  };
}

/** Revenue by employee (#7). Admin-only via finance.dashboard. */
export default function RevenuePage() {
  const { can } = useAuth();
  const [ranges] = useState(presets);
  const [range, setRange] = useState(ranges["This financial year"]);

  const { data, error } = useApi<RevenueReport>(
    can(TAGS.FINANCE_DASHBOARD) ? `/finance/revenue-by-employee${queryString(range)}` : null,
  );
  if (!can(TAGS.FINANCE_DASHBOARD)) return <NoAccess tag={TAGS.FINANCE_DASHBOARD} />;

  const max = Math.max(1, ...(data?.rows.map((r) => Number(r.revenue)) ?? [1]));

  return (
    <>
      <PageHeader title="Revenue by employee" />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        {Object.entries(ranges).map(([label, r]) => (
          <button
            key={label}
            onClick={() => setRange(r)}
            className={`${secondaryButtonCompactClass} ${
              range.from === r.from && range.to === r.to ? "bg-neutral-200 dark:bg-neutral-800" : ""
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex gap-2">
          <Field label="From">
            <input className={inputClass} type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </Field>
          <Field label="To">
            <input className={inputClass} type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </Field>
        </div>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Order value booked in the period (by order date, cancelled orders excluded), and how much of it has been
        collected so far.
      </p>
      <ErrorText error={error} />
      {data && data.rows.length === 0 && <p className="text-sm text-neutral-500">No orders in this period.</p>}
      {data && data.rows.length > 0 && (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Salesperson</th>
                <th className={`${thClass} text-right`}>Orders</th>
                <th className={`${thClass} text-right`}>Revenue</th>
                <th className={thClass}></th>
                <th className={`${thClass} text-right`}>Collected</th>
                <th className={`${thClass} text-right`}>Outstanding</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {data.rows.map((r) => (
                <tr key={r.salesperson.id}>
                  <td className={`${tdClass} font-medium`}>{r.salesperson.fullName}</td>
                  <td className={`${tdClass} text-right`}>{r.orders}</td>
                  <td className={`${tdClass} text-right font-medium`}>{formatINR(r.revenue)}</td>
                  <td className={`${tdClass} w-1/4`}>
                    <div className="h-2 rounded bg-neutral-100 dark:bg-neutral-800">
                      <div
                        className="h-2 rounded bg-sky-600"
                        style={{ width: `${(Number(r.revenue) / max) * 100}%` }}
                        aria-hidden
                      />
                    </div>
                  </td>
                  <td className={`${tdClass} text-right`}>{formatINR(r.collected)}</td>
                  <td className={`${tdClass} text-right`}>{formatINR(r.outstanding)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={tdClass}>Total</td>
                <td className={`${tdClass} text-right`}>{data.totals.orders}</td>
                <td className={`${tdClass} text-right`}>{formatINR(data.totals.revenue)}</td>
                <td className={tdClass}></td>
                <td className={`${tdClass} text-right`}>{formatINR(data.totals.collected)}</td>
                <td className={`${tdClass} text-right`}>{formatINR(data.totals.outstanding)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
