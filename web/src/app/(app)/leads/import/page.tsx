"use client";

import { Download, FileSpreadsheet, FileText, Upload, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  buttonClass,
  Field,
  inputClass,
  NoAccess,
  PageHeader,
  panelClass,
  secondaryButtonClass,
  tableClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { apiDownload, apiUpload } from "@/lib/api";
import { formatLitres, LeadSource, SOURCE_LABELS, SUMP_SIZES_LITRES } from "@/lib/crm";
import { TAGS } from "@/lib/tags";
import { useAction } from "@/lib/use-api";

interface ImportReport {
  fileName: string;
  totalRows: number;
  created: number;
  createdRows: { row: number; name: string; leadId: string; assignedTo: string | null; autoAssigned: boolean }[];
  duplicates: { row: number; name: string; phone: string; reason: string }[];
  failed: { row: number; name: string; errors: string[] }[];
  ignoredColumns: string[];
  assignments: { userId: string; fullName: string; count: number; autoAssigned: number }[];
  autoAssigned: number;
  unassigned: number;
}

/** Sources a whole file can default to (API is only for the public API). */
const DEFAULT_SOURCES: LeadSource[] = ["META", "MANUAL", "WEBSITE", "REFERRAL", "OTHER"];

function Summary({ label, value, tone }: { label: string; value: number; tone: "green" | "amber" | "red" }) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    red: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${value === 0 ? "border-neutral-200 bg-white text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900" : tones[tone]}`}>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-sm font-medium">{label}</div>
    </div>
  );
}

/** Bulk lead upload (#1): template download, CSV/XLSX upload, clear row-by-row result. */
export default function ImportLeadsPage() {
  const { can } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [defaultSource, setDefaultSource] = useState<LeadSource>("META");
  const upload = useAction();
  const download = useAction();
  if (!can(TAGS.LEADS_WRITE)) return <NoAccess tag={TAGS.LEADS_WRITE} />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setReport(null);
    await upload.run(async () => setReport(await apiUpload<ImportReport>("/leads/import", file, { defaultSource })));
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/leads" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
          ← Leads
        </Link>
        <PageHeader
          title="Import leads"
          subtitle="Upload a Meta lead export or any spreadsheet. Only name and phone are needed. Phones that already exist are skipped, and new leads are shared round-robin across the telecallers."
        />
      </div>

      <section className={`${panelClass} p-5`}>
        <h2 className="font-semibold">1. Get the template</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Only <strong>name</strong> and <strong>phone</strong> are required. A Meta export with &ldquo;full_name&rdquo; and
          &ldquo;phone_number&rdquo; works as it is. Optional: city, product (Sump or Microbes), sump size (
          {SUMP_SIZES_LITRES.map(formatLitres).join(", ")}), source, assigned salesperson, notes. Leave the salesperson blank to
          share the lead round-robin. Delete the two &ldquo;Example - …&rdquo; rows before uploading.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={secondaryButtonClass}
            disabled={download.busy}
            onClick={() => download.run(() => apiDownload("/leads/import/template?format=xlsx", "precon-leads-template.xlsx"))}
          >
            <FileSpreadsheet className="size-4" aria-hidden /> Excel template (.xlsx)
          </button>
          <button
            className={secondaryButtonClass}
            disabled={download.busy}
            onClick={() => download.run(() => apiDownload("/leads/import/template?format=csv", "precon-leads-template.csv"))}
          >
            <FileText className="size-4" aria-hidden /> CSV template
          </button>
          <a href="/samples/meta-leads-sample.csv" download className={secondaryButtonClass}>
            <Download className="size-4" aria-hidden /> Sample: 30 Meta leads (name + phone)
          </a>
        </div>
        {download.error && <p className="mt-2 text-sm font-medium text-red-600">{download.error}</p>}
      </section>

      <form onSubmit={handleSubmit} className={`${panelClass} space-y-3 p-5`}>
        <h2 className="font-semibold">2. Upload your file</h2>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-8 text-center text-sm hover:border-brand-400 hover:bg-brand-50/40 dark:border-neutral-700 dark:hover:bg-brand-950/30">
          <Upload className="size-6 text-brand-600" aria-hidden />
          <span className="font-medium">{file ? file.name : "Choose a .csv or .xlsx file"}</span>
          <span className="text-xs text-neutral-500">Up to 2 MB and 2,000 rows</span>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReport(null);
            }}
          />
        </label>
        <div className="max-w-xs">
          <Field label="Source for rows without one">
            <select className={inputClass} value={defaultSource} onChange={(e) => setDefaultSource(e.target.value as LeadSource)}>
              {DEFAULT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-neutral-500">
          Rows with no assigned salesperson go to the telecallers in turn (A, B, C, A, B, C…).
          {!can(TAGS.LEADS_ASSIGN) && " To keep a row yourself, put your own email in that column."}
        </p>
        {upload.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" role="alert">
            <p className="font-semibold">Nothing was imported.</p>
            <p>{upload.error}</p>
          </div>
        )}
        <button type="submit" className={buttonClass} disabled={!file || upload.busy}>
          {upload.busy ? "Importing…" : "Import leads"}
        </button>
      </form>

      {report && (
        <section className="space-y-4" aria-live="polite">
          <h2 className="text-lg font-bold tracking-tight">
            Result for {report.fileName} · {report.totalRows} row{report.totalRows === 1 ? "" : "s"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Leads created" value={report.created} tone="green" />
            <Summary label="Skipped as duplicates" value={report.duplicates.length} tone="amber" />
            <Summary label="Rows with errors (not imported)" value={report.failed.length} tone="red" />
          </div>
          {report.created > 0 && (
            <div className={`${panelClass} p-4`}>
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <Users className="size-4 text-brand-600" aria-hidden /> Who got the new leads
              </h3>
              {report.assignments.length === 0 && (
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Nobody: no telecaller is switched on for round-robin, so the leads are unassigned. Switch telecallers on under
                  Admin → Lead assignment.
                </p>
              )}
              <ul className="space-y-2">
                {report.assignments.map((a) => {
                  const pct = Math.round((a.count / report.created) * 100);
                  return (
                    <li key={a.userId} className="grid grid-cols-[minmax(8rem,12rem)_1fr_auto] items-center gap-3 text-sm">
                      <span className="truncate font-medium">{a.fullName}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="tabular-nums">
                        <strong>{a.count}</strong> lead{a.count === 1 ? "" : "s"}
                        {a.autoAssigned < a.count && <span className="text-neutral-500"> ({a.count - a.autoAssigned} named in file)</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {report.unassigned > 0 && report.assignments.length > 0 && (
                <p className="mt-2 text-sm text-neutral-500">{report.unassigned} left unassigned.</p>
              )}
            </div>
          )}
          {report.ignoredColumns.length > 0 && (
            <p className="text-sm text-neutral-500">Ignored unknown column(s): {report.ignoredColumns.join(", ")}</p>
          )}

          {report.failed.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-red-700 dark:text-red-300">Fix these rows and upload them again</h3>
              <div className={`overflow-x-auto ${panelClass}`}>
                <table className={tableClass}>
                  <thead className={theadClass}>
                    <tr>
                      <th className={thClass}>Row</th>
                      <th className={thClass}>Name</th>
                      <th className={thClass}>What&apos;s wrong</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyClass}>
                    {report.failed.map((f) => (
                      <tr key={f.row}>
                        <td className={`${tdClass} tabular-nums`}>{f.row}</td>
                        <td className={tdClass}>{f.name || <em className="text-neutral-400">(blank)</em>}</td>
                        <td className={`${tdClass} text-red-700 dark:text-red-300`}>{f.errors.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.duplicates.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-amber-800 dark:text-amber-300">Skipped: phone already exists</h3>
              <div className={`overflow-x-auto ${panelClass}`}>
                <table className={tableClass}>
                  <thead className={theadClass}>
                    <tr>
                      <th className={thClass}>Row</th>
                      <th className={thClass}>Name</th>
                      <th className={thClass}>Phone</th>
                      <th className={thClass}>Why skipped</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyClass}>
                    {report.duplicates.map((d) => (
                      <tr key={d.row}>
                        <td className={`${tdClass} tabular-nums`}>{d.row}</td>
                        <td className={tdClass}>{d.name}</td>
                        <td className={tdClass}>{d.phone}</td>
                        <td className={tdClass}>{d.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.createdRows.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-emerald-800 dark:text-emerald-300">Created</h3>
              <ul className={`${panelClass} divide-y divide-neutral-100 px-4 text-sm dark:divide-neutral-800`}>
                {report.createdRows.map((c) => (
                  <li key={c.leadId} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/leads/${c.leadId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                      {c.name}
                    </Link>
                    <span className="text-right text-xs text-neutral-500">
                      {c.assignedTo ? `→ ${c.assignedTo}` : "unassigned"} · row {c.row}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
