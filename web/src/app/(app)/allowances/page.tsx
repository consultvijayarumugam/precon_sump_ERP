"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ApprovalBadge,
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  MonthPicker,
  NoAccess,
  PageHeader,
  secondaryButtonClass,
  Stat,
  tableClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { api, apiPost, queryString } from "@/lib/api";
import { dayKey } from "@/lib/crm";
import { formatDateOnly, formatINR } from "@/lib/finance";
import {
  Allowance,
  ALLOWANCE_STATUSES,
  ALLOWANCE_TYPE_LABELS,
  ALLOWANCE_TYPES,
  AllowanceSummary,
  AllowanceType,
  currentMonth,
  Employee,
  LEAVE_STATUS_LABELS,
} from "@/lib/hr";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

interface Linkable {
  siteVisits: { id: string; visitDate: string; customerName: string; purpose: string }[];
  installations: { id: string; scheduledDate: string; customerName: string; orderNumberLabel: string }[];
}

function AllowanceForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { user, can } = useAuth();
  const manage = can(TAGS.ALLOWANCES_MANAGE);
  const employees = useApi<Employee[]>(manage ? "/hr/employees" : null);
  const [userId, setUserId] = useState(user.id);
  const linkable = useApi<Linkable>(`/allowances/linkable${queryString({ userId: userId === user.id ? undefined : userId })}`);
  const [type, setType] = useState<AllowanceType>("TRAVEL");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [description, setDescription] = useState("");
  const [link, setLink] = useState(""); // "visit:<id>" | "inst:<id>"
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const [kind, id] = link.split(":");
    const ok = await run(() =>
      apiPost("/allowances", {
        ...(userId !== user.id ? { userId } : {}),
        type,
        amount: Number(amount),
        date,
        description,
        siteVisitId: kind === "visit" ? id : null,
        installationId: kind === "inst" ? id : null,
      }),
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-medium">{manage ? "Add an allowance" : "Claim an allowance"}</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        {manage && (
          <Field label="Employee">
            <select
              className={inputClass}
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setLink("");
              }}
            >
              {employees.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Type">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as AllowanceType)}>
            {ALLOWANCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {ALLOWANCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (₹)">
          <input className={inputClass} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date">
          <input className={inputClass} type="date" required max={dayKey(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="What for">
        <input
          className={inputClass}
          required
          minLength={3}
          placeholder="e.g. Bus + auto to Divya Hospital, Salem"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {linkable.data && (linkable.data.siteVisits.length > 0 || linkable.data.installations.length > 0) && (
        <Field label="Link to a site visit or installation (optional)">
          <select className={inputClass} value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">Not linked</option>
            {linkable.data.siteVisits.map((v) => (
              <option key={v.id} value={`visit:${v.id}`}>
                Site visit · {formatDateOnly(v.visitDate)} · {v.customerName}: {v.purpose}
              </option>
            ))}
            {linkable.data.installations.map((i) => (
              <option key={i.id} value={`inst:${i.id}`}>
                Installation · {formatDateOnly(i.scheduledDate)} · {i.customerName} ({i.orderNumberLabel})
              </option>
            ))}
          </select>
        </Field>
      )}
      {!manage && <p className="text-xs text-neutral-500">Your claim goes to an admin for approval.</p>}
      <ErrorText error={error ?? employees.error ?? linkable.error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          {manage ? "Add (approved)" : "Submit claim"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DecideClaim({ allowance, onDone }: { allowance: Allowance; onDone: () => void }) {
  const [note, setNote] = useState("");
  const { run, busy, error } = useAction();
  const decide = async (action: "approve" | "reject") => {
    if (await run(() => apiPost(`/allowances/${allowance.id}/${action}`, { note: note || undefined }))) onDone();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className={`${inputClass} w-44 py-1`} placeholder="Note (to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className={`${buttonClass} py-1 text-xs`} disabled={busy} onClick={() => decide("approve")}>
        Approve
      </button>
      <button className={`${secondaryButtonClass} py-1 text-xs`} disabled={busy} onClick={() => decide("reject")}>
        Reject
      </button>
      <ErrorText error={error} />
    </div>
  );
}

/** Allowances (#8): your own, or everyone's with allowances.manage, plus monthly totals. */
export default function AllowancesPage() {
  const { user, can } = useAuth();
  const canRead = can(TAGS.ALLOWANCES_READ);
  const manage = can(TAGS.ALLOWANCES_MANAGE);
  const canAdd = manage || can(TAGS.ALLOWANCES_CLAIM);
  const [month, setMonth] = useState(currentMonth);
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const list = useApi<Allowance[]>(canRead ? `/allowances${queryString({ month, status })}` : null);
  const summary = useApi<AllowanceSummary>(canRead ? `/allowances/summary?month=${month}` : null);
  const action = useAction();
  if (!canRead) return <NoAccess tag={TAGS.ALLOWANCES_READ} />;

  const reload = () => {
    list.reload();
    summary.reload();
  };
  const mine = summary.data?.rows.find((r) => r.employee.id === user.id);

  return (
    <div className="space-y-6">
      <PageHeader title={manage ? "Allowances" : "My allowances"} action={<MonthPicker month={month} onChange={setMonth} />} />
      <ErrorText error={list.error ?? summary.error ?? action.error} />

      {summary.data &&
        (manage ? (
          <section>
            <h2 className="mb-2 font-medium">Monthly total per employee</h2>
            {summary.data.rows.length === 0 ? (
              <p className="text-sm text-neutral-500">No allowances this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead className={theadClass}>
                    <tr>
                      <th className={thClass}>Employee</th>
                      {ALLOWANCE_TYPES.map((t) => (
                        <th key={t} className={`${thClass} text-right`}>
                          {ALLOWANCE_TYPE_LABELS[t]}
                        </th>
                      ))}
                      <th className={`${thClass} text-right`}>Approved total</th>
                      <th className={`${thClass} text-right`}>Pending</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyClass}>
                    {summary.data.rows.map((r) => (
                      <tr key={r.employee.id}>
                        <td className={`${tdClass} font-medium`}>{r.employee.fullName}</td>
                        {ALLOWANCE_TYPES.map((t) => (
                          <td key={t} className={`${tdClass} text-right`}>
                            {Number(r.approvedByType[t]) > 0 ? formatINR(r.approvedByType[t]) : "-"}
                          </td>
                        ))}
                        <td className={`${tdClass} text-right font-semibold`}>{formatINR(r.approvedTotal)}</td>
                        <td className={`${tdClass} text-right text-amber-700 dark:text-amber-300`}>
                          {Number(r.pendingTotal) > 0 ? formatINR(r.pendingTotal) : "-"}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className={tdClass}>Total</td>
                      <td className={tdClass} colSpan={ALLOWANCE_TYPES.length}></td>
                      <td className={`${tdClass} text-right`}>{formatINR(summary.data.totals.approved)}</td>
                      <td className={`${tdClass} text-right`}>{formatINR(summary.data.totals.pending)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          <section className="flex gap-8">
            <Stat label="Approved this month" value={formatINR(mine?.approvedTotal ?? 0)} />
            <Stat label="Waiting for approval" value={formatINR(mine?.pendingTotal ?? 0)} />
          </section>
        ))}

      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputClass} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {ALLOWANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAVE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {canAdd && !adding && (
          <button className={`${buttonClass} ml-auto`} onClick={() => setAdding(true)}>
            {manage ? "Add allowance" : "Claim allowance"}
          </button>
        )}
      </div>
      {adding && (
        <AllowanceForm
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      )}

      {list.data?.length === 0 && <p className="text-sm text-neutral-500">No entries.</p>}
      <ul className="space-y-2">
        {list.data?.map((a) => (
          <li key={a.id} className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{formatINR(a.amount)}</span>
              <span>{ALLOWANCE_TYPE_LABELS[a.type]}</span>
              <span className="text-neutral-500">{formatDateOnly(a.date)}</span>
              <ApprovalBadge status={a.status} />
              {manage && <span className="font-medium">{a.user.fullName}</span>}
              {a.status === "PENDING" && a.user.id === user.id && !manage && (
                <button
                  className="ml-auto text-xs text-neutral-500 underline"
                  onClick={async () => {
                    if (!confirm("Withdraw this claim?")) return;
                    if (await action.run(() => api(`/allowances/${a.id}`, { method: "DELETE" }))) reload();
                  }}
                >
                  Withdraw
                </button>
              )}
            </div>
            <p className="mt-1">{a.description}</p>
            {(a.siteVisit || a.installation) && (
              <p className="text-xs text-neutral-500">
                {a.siteVisit && `Site visit: ${a.siteVisit.customerName} (${formatDateOnly(a.siteVisit.visitDate)})`}
                {a.installation && `Installation: ${a.installation.customerName} (${a.installation.orderNumberLabel})`}
              </p>
            )}
            {a.decisionNote && (
              <p className="text-xs text-neutral-500">
                {a.decidedBy?.fullName}: “{a.decisionNote}”
              </p>
            )}
            {manage && a.status === "PENDING" && (
              <div className="mt-2">
                <DecideClaim allowance={a} onDone={reload} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
