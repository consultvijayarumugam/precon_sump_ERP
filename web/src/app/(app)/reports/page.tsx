"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Badge,
  ErrorText,
  inputClass,
  NoAccess,
  PageHeader,
  panelClass,
  secondaryButtonSmClass,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { apiDownload, queryString } from "@/lib/api";
import { dayKey } from "@/lib/crm";
import { formatINR } from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

type Kind = "text" | "number" | "percent" | "money";
type Cell = string | number | null;
interface Report {
  key: string;
  title: string;
  description: string;
  scope: "all" | "own";
  from: string;
  to: string;
  columns: { key: string; label: string; kind: Kind }[];
  rows: Record<string, Cell>[];
  totals: Record<string, Cell> | null;
}
interface Available {
  key: string;
  title: string;
  description: string;
  scope: "all" | "own";
}

function presets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const today = dayKey(now);
  const first = (y: number, m: number) => dayKey(new Date(y, m, 1));
  const last = (y: number, m: number) => dayKey(new Date(y, m + 1, 0));
  const y = now.getFullYear();
  const m = now.getMonth();
  const weekAgo = dayKey(new Date(now.getTime() - 6 * 86_400_000));
  const fyStart = m >= 3 ? first(y, 3) : first(y - 1, 3); // Indian financial year starts 1 April
  return [
    { label: "This month", from: first(y, m), to: today },
    { label: "Last month", from: first(y, m - 1), to: last(y, m - 1) },
    { label: "Last 7 days", from: weekAgo, to: today },
    { label: "Last 90 days", from: dayKey(new Date(now.getTime() - 89 * 86_400_000)), to: today },
    { label: "This financial year", from: fyStart, to: today },
  ];
}

function format(kind: Kind, v: Cell) {
  if (v === null || v === undefined) return "–";
  if (kind === "percent") return `${Math.round(Number(v) * 1000) / 10}%`;
  if (kind === "money") return formatINR(v);
  if (kind === "number") return Number(v).toLocaleString("en-IN");
  return String(v);
}

function ReportCard({ meta, from, to }: { meta: Available; from: string; to: string }) {
  const qs = queryString({ from, to });
  const { data, error } = useApi<Report>(`/reports/${meta.key}${qs}`);
  const download = useAction();
  const file = (fmt: "csv" | "xlsx") =>
    download.run(() => apiDownload(`/reports/${meta.key}${queryString({ from, to, format: fmt })}`, `precon-${meta.key}.${fmt}`));

  return (
    <section className={`${panelClass} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 p-4 dark:border-neutral-800">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{meta.title}</h2>
          <p className="text-sm text-neutral-500">{meta.description}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryButtonSmClass} onClick={() => file("csv")} disabled={download.busy}>
            <FileText className="size-4" aria-hidden /> CSV
          </button>
          <button type="button" className={secondaryButtonSmClass} onClick={() => file("xlsx")} disabled={download.busy}>
            <FileSpreadsheet className="size-4" aria-hidden /> Excel
          </button>
        </div>
      </div>
      <div className="p-4">
        <ErrorText error={error ?? download.error} />
        {!data && !error && <p className="text-sm text-neutral-500">Loading…</p>}
        {data && data.rows.length === 0 && <p className="text-sm text-neutral-500">Nothing in this period.</p>}
        {data && data.rows.length > 0 && (
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c.key} className={`${thClass} ${c.kind === "text" ? "" : "text-right"}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    {data.columns.map((c) => (
                      <td key={c.key} className={`${tdClass} ${c.kind === "text" ? "font-medium" : "text-right tabular-nums"}`}>
                        {format(c.kind, r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                {data.totals && (
                  <tr className="bg-brand-50/60 font-bold dark:bg-brand-950/30">
                    {data.columns.map((c) => (
                      <td key={c.key} className={`${tdClass} ${c.kind === "text" ? "" : "text-right tabular-nums"}`}>
                        {format(c.kind, data.totals![c.key])}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/** Reports with a date range, each exportable to CSV and Excel. You see only what your tags allow. */
export default function ReportsPage() {
  const { can } = useAuth();
  const allowed = can(TAGS.REPORTS_VIEW) || can(TAGS.REPORTS_VIEW_ALL);
  const list = useApi<Available[]>(allowed ? "/reports" : null);
  const [range, setRange] = useState(() => presets()[0]);
  if (!allowed) return <NoAccess tag={TAGS.REPORTS_VIEW} />;
  const scope = list.data?.[0]?.scope;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Leads, conversion, pipeline, revenue and follow-up compliance for any period.
            {scope && <Badge tone={scope === "all" ? "blue" : "violet"}>{scope === "all" ? "Everyone's data" : "Your own data"}</Badge>}
          </span>
        }
      />
      <section className={`${panelClass} flex flex-wrap items-end gap-3 p-4`}>
        <div className="flex flex-wrap gap-1.5">
          {presets().map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setRange(p)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                range.from === p.from && range.to === p.to
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-neutral-300 bg-white hover:border-brand-400 dark:border-neutral-700 dark:bg-neutral-900"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-neutral-700 dark:text-neutral-300">From</span>
            <input type="date" className={inputClass} value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, label: "Custom", from: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-neutral-700 dark:text-neutral-300">To</span>
            <input type="date" className={inputClass} value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, label: "Custom", to: e.target.value })} />
          </label>
        </div>
      </section>
      <ErrorText error={list.error} />
      {list.data?.map((meta) => <ReportCard key={`${meta.key}-${range.from}-${range.to}`} meta={meta} from={range.from} to={range.to} />)}
    </div>
  );
}
