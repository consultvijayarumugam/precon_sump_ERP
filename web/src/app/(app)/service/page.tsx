"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ServiceJobForm } from "@/components/service-job-form";
import {
  buttonClass,
  ErrorText,
  inputClass,
  JobStatusBadge,
  NoAccess,
  overdueRowClass,
  PageHeader,
  PriorityBadge,
  tableClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { queryString } from "@/lib/api";
import { formatDateTime } from "@/lib/crm";
import {
  JOB_PRIORITIES,
  JOB_PRIORITY_LABELS,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  JOB_TYPE_LABELS,
  JOB_TYPES,
  ServiceJob,
} from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

/** Post-install service jobs (#4). Unresolved and most urgent first. */
export default function ServiceJobsPage() {
  const { can } = useAuth();
  const [filters, setFilters] = useState({ status: "", type: "", priority: "" });
  const [onlyMine, setOnlyMine] = useState(false);
  const [raising, setRaising] = useState(false);
  const [now] = useState(() => Date.now());

  const { data, error } = useApi<ServiceJob[]>(
    can(TAGS.SERVICE_READ)
      ? `/service-jobs${queryString({ ...filters, assignedTo: onlyMine ? "me" : undefined })}`
      : null,
  );
  if (!can(TAGS.SERVICE_READ)) return <NoAccess tag={TAGS.SERVICE_READ} />;

  const set = (key: keyof typeof filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <>
      <PageHeader
        title={can(TAGS.SERVICE_READ_ALL) ? "Service jobs" : "Service jobs: my customers and my jobs"}
        action={
          can(TAGS.SERVICE_WRITE) &&
          !raising && (
            <button className={buttonClass} onClick={() => setRaising(true)}>
              New service job
            </button>
          )
        }
      />
      {raising && (
        <div className="mb-6">
          <ServiceJobForm onCancel={() => setRaising(false)} />
        </div>
      )}
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <select className={inputClass} value={filters.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">All statuses</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {JOB_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className={inputClass} value={filters.type} onChange={(e) => set("type", e.target.value)}>
          <option value="">All types</option>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {JOB_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select className={inputClass} value={filters.priority} onChange={(e) => set("priority", e.target.value)}>
          <option value="">All priorities</option>
          {JOB_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {JOB_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Only assigned to me
        </label>
      </div>
      <ErrorText error={error} />
      {data && data.length === 0 && <p className="text-sm text-neutral-500">No service jobs.</p>}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Job</th>
                <th className={thClass}>Customer</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Priority</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Assigned</th>
                <th className={thClass}>Next follow-up</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {data.map((j) => {
                const overdue = j.nextFollowUpAt && new Date(j.nextFollowUpAt).getTime() < now;
                return (
                  <tr key={j.id} className={overdue ? overdueRowClass : ""}>
                    <td className={tdClass}>
                      <Link href={`/service/${j.id}`} className="font-medium underline">
                        {j.jobNumberLabel}
                      </Link>
                    </td>
                    <td className={tdClass}>
                      {j.customer.name}
                      <div className="max-w-56 truncate text-xs text-neutral-500">{j.description}</div>
                    </td>
                    <td className={tdClass}>{JOB_TYPE_LABELS[j.type]}</td>
                    <td className={tdClass}>
                      <PriorityBadge priority={j.priority} />
                    </td>
                    <td className={tdClass}>
                      <JobStatusBadge status={j.status} />
                    </td>
                    <td className={tdClass}>{j.assignedTo?.fullName ?? <em className="text-neutral-500">Unassigned</em>}</td>
                    <td className={tdClass}>
                      {j.nextFollowUpAt ? (
                        <span className={overdue ? "font-medium text-red-600" : ""}>
                          {formatDateTime(j.nextFollowUpAt)}
                          {overdue && " (overdue)"}
                        </span>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
