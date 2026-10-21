"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ApprovalBadge,
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  PageHeader,
  secondaryButtonSmClass,
  Stat,
} from "@/components/ui";
import { apiPost } from "@/lib/api";
import { dayKey } from "@/lib/crm";
import { formatDateOnly } from "@/lib/finance";
import {
  currentMonth,
  formatMonth,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  LeaveApplication,
  LeaveBalance,
  LeaveType,
  LopRow,
} from "@/lib/hr";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

function ApplyForm({ balance, onDone }: { balance: LeaveBalance | null; onDone: () => void }) {
  const [type, setType] = useState<LeaveType>("CASUAL");
  const [startDate, setStartDate] = useState(() => dayKey(new Date()));
  const [endDate, setEndDate] = useState(() => dayKey(new Date()));
  const [reason, setReason] = useState("");
  const { run, busy, error } = useAction();
  const available = balance?.paid.find((p) => p.type === type)?.available;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => apiPost("/leave", { type, startDate, endDate, reason }))) {
      setReason("");
      onDone();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-white shadow-xs p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-medium">Apply for leave</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAVE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input
            className={inputClass}
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
          />
        </Field>
        <Field label="To (inclusive)">
          <input className={inputClass} type="date" required min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason">
        <input className={inputClass} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p className="text-xs text-neutral-500">
        Only working days count. Sundays and company holidays inside the range are skipped.
        {type === "UNPAID"
          ? " Every unpaid day is Loss of Pay."
          : available !== undefined && ` You can apply for up to ${available} more ${type.toLowerCase()} day(s) this year.`}
      </p>
      <ErrorText error={error} />
      <button type="submit" className={buttonClass} disabled={busy}>
        Submit for approval
      </button>
    </form>
  );
}

/** My leave (#19): balance, apply, history, and this month's LOP. */
export default function MyLeavePage() {
  const { can } = useAuth();
  const canApply = can(TAGS.LEAVE_APPLY);
  const [applying, setApplying] = useState(false);
  const [month] = useState(currentMonth);
  const balance = useApi<LeaveBalance>(canApply ? "/leave/balance" : null);
  const mine = useApi<LeaveApplication[]>(canApply ? "/leave/mine" : null);
  const lop = useApi<{ row: LopRow | null }>(canApply ? `/leave/lop/mine?month=${month}` : null);
  const action = useAction();
  const [today] = useState(() => dayKey(new Date()));

  if (!canApply) return <NoAccess tag={TAGS.LEAVE_APPLY} />;
  const reload = () => {
    balance.reload();
    mine.reload();
    lop.reload();
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="My leave"
        action={
          !applying && (
            <button className={buttonClass} onClick={() => setApplying(true)}>
              Apply for leave
            </button>
          )
        }
      />
      <ErrorText error={balance.error ?? mine.error ?? lop.error ?? action.error} />

      {balance.data && (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {balance.data.paid.map((p) => (
            <div key={p.type} className="rounded-lg border border-neutral-200 bg-white shadow-xs p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <Stat label={`${LEAVE_TYPE_LABELS[p.type]} left of ${p.entitlement}`} value={p.remaining} />
              <div className="mt-1 text-xs text-neutral-500">
                {p.taken} taken{p.pending > 0 && ` · ${p.pending} pending`}
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-neutral-200 bg-white shadow-xs p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <Stat label={`Unpaid days in ${balance.data.year}`} value={balance.data.unpaid.taken} />
          </div>
          {lop.data?.row && (
            <div
              className={`rounded border p-3 ${
                lop.data.row.lopDays > 0 ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <Stat label={`LOP days in ${formatMonth(month)}`} value={lop.data.row.lopDays} tone={lop.data.row.lopDays > 0 ? "alert" : undefined} />
              {lop.data.row.lopDates.length > 0 && (
                <div className="mt-1 text-xs text-neutral-500">
                  {lop.data.row.lopDates
                    .map((d) => `${formatDateOnly(d.date)} (${d.reason === "UNPAID_LEAVE" ? "unpaid leave" : "absent without approval"})`)
                    .join(", ")}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {applying && (
        <ApplyForm
          balance={balance.data}
          onDone={() => {
            setApplying(false);
            reload();
          }}
        />
      )}

      <section>
        <h2 className="mb-2 font-medium">My applications this year</h2>
        {mine.data?.length === 0 && <p className="text-sm text-neutral-500">No leave applied yet.</p>}
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white px-4 text-sm shadow-xs dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {mine.data?.map((l) => {
            const cancellable = l.status === "PENDING" || (l.status === "APPROVED" && l.startDate > today);
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="w-56 font-medium">
                  {formatDateOnly(l.startDate)}
                  {l.endDate !== l.startDate && ` – ${formatDateOnly(l.endDate)}`}
                </span>
                <span>
                  {LEAVE_TYPE_LABELS[l.type]} · {l.days} day{l.days === 1 ? "" : "s"}
                </span>
                <ApprovalBadge status={l.status} />
                <span className="text-neutral-500">{l.reason}</span>
                {l.decisionNote && <span className="text-xs text-neutral-500">“{l.decisionNote}” ({l.decidedBy?.fullName})</span>}
                {cancellable && (
                  <button
                    className={`${secondaryButtonSmClass} ml-auto`}
                    disabled={action.busy}
                    onClick={async () => {
                      if (!confirm("Withdraw this leave application?")) return;
                      if (await action.run(() => apiPost(`/leave/${l.id}/cancel`))) reload();
                    }}
                  >
                    Withdraw
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
