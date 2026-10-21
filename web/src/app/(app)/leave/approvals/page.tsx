"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ApprovalBadge,
  buttonCompactClass,
  ErrorText,
  inputClass,
  NoAccess,
  PageHeader,
  secondaryButtonCompactClass,
} from "@/components/ui";
import { apiPost, queryString } from "@/lib/api";
import { formatDateOnly } from "@/lib/finance";
import { LEAVE_STATUS_LABELS, LEAVE_STATUSES, LEAVE_TYPE_LABELS, LeaveApplication } from "@/lib/hr";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

function Decide({ leave, onDone }: { leave: LeaveApplication; onDone: () => void }) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const { run, busy, error } = useAction();
  if (leave.user.id === user.id) return <span className="text-xs text-neutral-500">Your own: another approver decides</span>;
  const decide = async (action: "approve" | "reject") => {
    if (await run(() => apiPost(`/leave/${leave.id}/${action}`, { note: note || undefined }))) onDone();
  };
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <input
        className={`${inputClass} sm:w-56`}
        placeholder="Note (required to reject)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button className={buttonCompactClass} disabled={busy} onClick={() => decide("approve")}>
        Approve
      </button>
      <button className={secondaryButtonCompactClass} disabled={busy} onClick={() => decide("reject")}>
        Reject
      </button>
      <ErrorText error={error} />
    </div>
  );
}

/** Leave approvals (#19) for leave.approve holders. Pending first. */
export default function LeaveApprovalsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState("PENDING");
  const { data, error, reload } = useApi<LeaveApplication[]>(
    can(TAGS.LEAVE_APPROVE) ? `/leave/applications${queryString({ status })}` : null,
  );
  if (!can(TAGS.LEAVE_APPROVE)) return <NoAccess tag={TAGS.LEAVE_APPROVE} />;

  return (
    <>
      <PageHeader title="Leave approvals" />
      <div className="mb-4 max-w-xs">
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All applications</option>
          {LEAVE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAVE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <ErrorText error={error} />
      {data?.length === 0 && <p className="text-sm text-neutral-500">Nothing here.</p>}
      <ul className="space-y-2">
        {data?.map((l) => (
          <li key={l.id} className="rounded-lg border border-neutral-200 bg-white shadow-xs p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{l.user.fullName}</span>
              <span className="text-xs text-neutral-500">{l.user.role.name}</span>
              <ApprovalBadge status={l.status} />
              <span>
                {LEAVE_TYPE_LABELS[l.type]} · {formatDateOnly(l.startDate)}
                {l.endDate !== l.startDate && ` – ${formatDateOnly(l.endDate)}`} · <strong>{l.days}</strong> working day
                {l.days === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">{l.reason}</p>
            {l.decisionNote && (
              <p className="text-xs text-neutral-500">
                {l.decidedBy?.fullName}: “{l.decisionNote}”
              </p>
            )}
            {l.status === "PENDING" && (
              <div className="mt-2">
                <Decide leave={l} onDone={reload} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
