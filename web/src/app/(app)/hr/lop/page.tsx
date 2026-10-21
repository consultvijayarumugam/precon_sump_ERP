"use client";

import { FormEvent, Fragment, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  MonthPicker,
  NoAccess,
  overdueRowClass,
  PageHeader,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { api, apiPost } from "@/lib/api";
import { dayKey } from "@/lib/crm";
import { formatDateOnly } from "@/lib/finance";
import { currentMonth, Employee, LopSummary } from "@/lib/hr";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

function RecordAbsence({ onDone }: { onDone: () => void }) {
  const employees = useApi<Employee[]>("/hr/employees");
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [note, setNote] = useState("");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => apiPost("/lop/absences", { userId, date, note: note || undefined }))) {
      setNote("");
      onDone();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-neutral-200 bg-white shadow-xs p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-medium">Record an absence without approval</h2>
      <p className="text-xs text-neutral-500">
        For a working day someone was away without approved leave. It counts as LOP. When attendance arrives with the
        mobile app, these will be filled in automatically.
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_2fr_auto] sm:items-end">
        <Field label="Employee">
          <select className={inputClass} required value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose…</option>
            {employees.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName} ({e.role.name})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input className={inputClass} type="date" required max={dayKey(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <input className={inputClass} placeholder="e.g. Did not report; no leave applied" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" className={buttonClass} disabled={busy}>
          Record
        </button>
      </div>
      <ErrorText error={error ?? employees.error} />
    </form>
  );
}

/** Loss of Pay summary (#19): per-employee monthly days for payroll. */
export default function LopPage() {
  const { can } = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, error, reload } = useApi<LopSummary>(can(TAGS.LEAVE_APPROVE) ? `/lop/summary?month=${month}` : null);
  const action = useAction();
  if (!can(TAGS.LEAVE_APPROVE)) return <NoAccess tag={TAGS.LEAVE_APPROVE} />;

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Loss of Pay (LOP) summary" action={<MonthPicker month={month} onChange={setMonth} />} />
        <details className="text-sm text-neutral-500">
          <summary className="cursor-pointer">How this is calculated</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Only <strong>working days</strong> count: every day except Sundays and company holidays.</li>
            <li><strong>Paid leave</strong>: approved casual or sick leave days.</li>
            <li>
              <strong>LOP</strong> = approved <em>unpaid</em> leave days + recorded <em>absences without approval</em> (on days not
              covered by approved leave).
            </li>
            <li><strong>Present-equivalent</strong> = working days − paid leave − LOP (days assumed worked until attendance exists).</li>
            <li><strong>Paid days</strong> = working days − LOP. This is the number payroll will use later.</li>
            <li>Pending leave isn&apos;t counted either way. Decide it before closing the month.</li>
          </ul>
        </details>
      </div>
      <ErrorText error={error ?? action.error} />

      {data && (
        <>
          <p className="text-sm">
            <strong>{data.workingDays}</strong> working days in this month
            {data.holidays.length > 0 && ` (holidays: ${data.holidays.map((h) => `${h.name} ${formatDateOnly(h.date)}`).join(", ")})`}.{" "}
            {data.totals.employeesWithLop > 0 ? (
              <span className="font-medium text-red-600">
                {data.totals.employeesWithLop} employee{data.totals.employeesWithLop === 1 ? "" : "s"} with {data.totals.lopDays} LOP day
                {data.totals.lopDays === 1 ? "" : "s"}.
              </span>
            ) : (
              "No LOP this month."
            )}
            {data.totals.pendingLeaveDays > 0 && (
              <span className="text-amber-700 dark:text-amber-300"> {data.totals.pendingLeaveDays} day(s) of leave still pending a decision.</span>
            )}
          </p>
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Employee</th>
                  <th className={`${thClass} text-right`}>Working</th>
                  <th className={`${thClass} text-right`}>Paid leave</th>
                  <th className={`${thClass} text-right`}>Unpaid leave</th>
                  <th className={`${thClass} text-right`}>Absent w/o approval</th>
                  <th className={`${thClass} text-right`}>LOP</th>
                  <th className={`${thClass} text-right`}>Present-equiv.</th>
                  <th className={`${thClass} text-right`}>Paid days</th>
                  <th className={`${thClass} text-right`}>Pending</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {data.rows.map((r) => (
                  <Fragment key={r.employee.id}>
                    <tr className={r.lopDays > 0 ? overdueRowClass : ""}>
                      <td className={tdClass}>
                        <div className="font-medium">{r.employee.fullName}</div>
                        <div className="text-xs text-neutral-500">{r.employee.role.name}</div>
                      </td>
                      <td className={`${tdClass} text-right`}>{r.workingDays}</td>
                      <td className={`${tdClass} text-right`}>{r.paidLeaveDays}</td>
                      <td className={`${tdClass} text-right`}>{r.unpaidLeaveDays}</td>
                      <td className={`${tdClass} text-right`}>{r.absentWithoutApproval}</td>
                      <td className={`${tdClass} text-right font-semibold ${r.lopDays > 0 ? "text-red-600" : ""}`}>
                        {r.lopDays > 0 ? (
                          <button className="text-brand-700 hover:underline dark:text-brand-300" onClick={() => setExpanded(expanded === r.employee.id ? null : r.employee.id)}>
                            {r.lopDays}
                          </button>
                        ) : (
                          0
                        )}
                      </td>
                      <td className={`${tdClass} text-right`}>{r.presentEquivalent}</td>
                      <td className={`${tdClass} text-right font-medium`}>{r.paidDays}</td>
                      <td className={`${tdClass} text-right ${r.pendingLeaveDays > 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>
                        {r.pendingLeaveDays}
                      </td>
                    </tr>
                    {expanded === r.employee.id && (
                      <tr>
                        <td colSpan={9} className="bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
                          <ul className="space-y-1 text-xs">
                            {r.lopDates.map((d) => (
                              <li key={d.date} className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{formatDateOnly(d.date)}</span>
                                <span>{d.reason === "UNPAID_LEAVE" ? "Unpaid leave" : "Absent without approval"}</span>
                                {d.note && <span className="text-neutral-500">· {d.note}</span>}
                                {d.absenceId && (
                                  <button
                                    className="font-medium text-red-600 hover:underline"
                                    onClick={async () => {
                                      if (!confirm("Remove this absence? It will no longer count as LOP.")) return;
                                      if (await action.run(() => api(`/lop/absences/${d.absenceId}`, { method: "DELETE" }))) reload();
                                    }}
                                  >
                                    Remove
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <RecordAbsence onDone={reload} />
    </div>
  );
}
