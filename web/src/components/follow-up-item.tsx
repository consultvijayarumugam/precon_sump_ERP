"use client";

import Link from "next/link";
import { ReactNode, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ErrorText, inputClass, secondaryButtonClass, StatusBadge } from "@/components/ui";
import { apiPost } from "@/lib/api";
import {
  FOLLOW_UP_OUTCOMES,
  FollowUp,
  FollowUpWithLead,
  formatDateTime,
  isOverdue,
  OUTCOME_LABELS,
} from "@/lib/crm";
import {
  JOB_PRIORITY_LABELS,
  JOB_TYPE_LABELS,
  SERVICE_OUTCOME_LABELS,
  SERVICE_OUTCOMES,
  ServiceFollowUp,
  ServiceFollowUpWithJob,
} from "@/lib/service";
import { TAGS } from "@/lib/tags";

interface CardProps {
  followUp: { id: string; scheduledAt: string; note: string | null; outcome: string | null; completedAt: string | null };
  outcomes: readonly string[];
  outcomeLabels: Record<string, string>;
  /** "/follow-ups" or "/service-follow-ups" */
  endpoint: string;
  canWrite: boolean;
  /** What the follow-up is about (lead / service job), shown under the time. */
  context?: ReactNode;
  onChange: () => void;
}

/** One follow-up: when, note, outcome, and a "Record outcome" action. Overdue ones are red. */
function FollowUpCard({ followUp, outcomes, outcomeLabels, endpoint, canWrite, context, onChange }: CardProps) {
  const [recording, setRecording] = useState(false);
  const [outcome, setOutcome] = useState(outcomes[0]);
  const [note, setNote] = useState(followUp.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overdue = isOverdue(followUp);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setRecording(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded border p-3 text-sm ${
        overdue
          ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{formatDateTime(followUp.scheduledAt)}</span>
          {overdue && <span className="text-xs font-medium text-red-600">Overdue</span>}
          {followUp.completedAt && (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-200">
              Done: {followUp.outcome ? outcomeLabels[followUp.outcome] : "-"}
            </span>
          )}
        </div>
        {canWrite && !recording && (
          <div className="flex gap-2">
            {followUp.completedAt ? (
              <button
                className="text-xs text-neutral-500 underline"
                disabled={busy}
                onClick={() => run(() => apiPost(`${endpoint}/${followUp.id}/reopen`))}
              >
                Reopen
              </button>
            ) : (
              <button className={secondaryButtonClass + " py-1 text-xs"} onClick={() => setRecording(true)}>
                Record outcome
              </button>
            )}
          </div>
        )}
      </div>

      {context && <div className="mt-1 flex flex-wrap items-center gap-2">{context}</div>}

      {followUp.note && !recording && <p className="mt-1 text-neutral-600 dark:text-neutral-400">{followUp.note}</p>}

      {recording && (
        <div className="mt-2 space-y-2">
          <select className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {outcomes.map((o) => (
              <option key={o} value={o}>
                {outcomeLabels[o]}
              </option>
            ))}
          </select>
          <textarea
            className={inputClass}
            rows={2}
            placeholder="What happened?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className={secondaryButtonClass + " py-1 text-xs"}
              disabled={busy}
              onClick={() => run(() => apiPost(`${endpoint}/${followUp.id}/complete`, { outcome, note: note || undefined }))}
            >
              Save outcome
            </button>
            <button className="text-xs text-neutral-500" onClick={() => setRecording(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ErrorText error={error} />
    </li>
  );
}

/** A sales follow-up (Phase 2). Shows its lead when listed outside the lead page. */
export function FollowUpItem({ followUp, onChange }: { followUp: FollowUp | FollowUpWithLead; onChange: () => void }) {
  const { can } = useAuth();
  const lead = "lead" in followUp ? followUp.lead : null;
  return (
    <FollowUpCard
      followUp={followUp}
      outcomes={FOLLOW_UP_OUTCOMES}
      outcomeLabels={OUTCOME_LABELS}
      endpoint="/follow-ups"
      canWrite={can(TAGS.FOLLOWUPS_WRITE)}
      onChange={onChange}
      context={
        lead && (
          <>
            <Link href={`/leads/${lead.id}`} className="font-medium underline">
              {lead.name}
            </Link>
            <a href={`tel:${lead.phone}`} className="text-neutral-500">
              {lead.phone}
            </a>
            <StatusBadge status={lead.status} />
            {can(TAGS.LEADS_READ_ALL) && (
              <span className="text-xs text-neutral-500">{lead.assignedTo?.fullName ?? "Unassigned"}</span>
            )}
          </>
        )
      }
    />
  );
}

/** A service follow-up (#5). Shows its job when listed outside the job page. */
export function ServiceFollowUpItem({
  followUp,
  onChange,
}: {
  followUp: ServiceFollowUp | ServiceFollowUpWithJob;
  onChange: () => void;
}) {
  const { can } = useAuth();
  const job = "serviceJob" in followUp ? followUp.serviceJob : null;
  return (
    <FollowUpCard
      followUp={followUp}
      outcomes={SERVICE_OUTCOMES}
      outcomeLabels={SERVICE_OUTCOME_LABELS}
      endpoint="/service-follow-ups"
      canWrite={can(TAGS.SERVICE_WRITE)}
      onChange={onChange}
      context={
        job && (
          <>
            <Link href={`/service/${job.id}`} className="font-medium underline">
              {job.jobNumberLabel} · {job.customerName}
            </Link>
            <a href={`tel:${job.phone}`} className="text-neutral-500">
              {job.phone}
            </a>
            <span className="text-xs text-neutral-500">
              {JOB_TYPE_LABELS[job.type]} · {JOB_PRIORITY_LABELS[job.priority]}
              {` · ${job.assignedTo?.fullName ?? "Unassigned"}`}
            </span>
          </>
        )
      }
    />
  );
}
