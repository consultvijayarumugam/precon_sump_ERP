"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  overdueRowClass,
  StatusBadge,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { formatDate, formatDateTime, LeadListItem, productInterestLabel, SOURCE_LABELS, TAGS } from "@/lib/crm";

/** Lead list used by the Leads and Won pages. `variant="won"` shows the close date. */
export function LeadsTable({ leads, variant = "all" }: { leads: LeadListItem[]; variant?: "all" | "won" }) {
  const { can } = useAuth();
  // Admins see every owner; telecallers see who has the leads they handed over.
  const showOwner = can(TAGS.LEADS_READ_ALL) || can(TAGS.LEADS_QUALIFY);
  const [now] = useState(() => Date.now()); // fixed per render pass so rows agree

  if (leads.length === 0) return <p className="text-sm text-neutral-500">No leads match.</p>;

  return (
    <div className={tableWrapClass}>
      <table className={tableClass}>
        <thead className={theadClass}>
          <tr>
            <th className={thClass}>Name</th>
            <th className={thClass}>Phone</th>
            <th className={thClass}>Product</th>
            <th className={thClass}>Source</th>
            {variant === "all" && <th className={thClass}>Status</th>}
            {showOwner && <th className={thClass}>Assigned to</th>}
            <th className={thClass}>{variant === "won" ? "Won on" : "Next follow-up"}</th>
          </tr>
        </thead>
        <tbody className={tbodyClass}>
          {leads.map((lead) => {
            const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
            return (
              <tr key={lead.id} className={overdue ? overdueRowClass : ""}>
                <td className={tdClass}>
                  <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                    {lead.name}
                  </Link>
                  {lead.city && <div className="text-xs text-neutral-500">{lead.city}</div>}
                </td>
                <td className={tdClass}>
                  <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                </td>
                <td className={tdClass}>{productInterestLabel(lead)}</td>
                <td className={tdClass}>{SOURCE_LABELS[lead.source]}</td>
                {variant === "all" && (
                  <td className={tdClass}>
                    <StatusBadge status={lead.status} />
                  </td>
                )}
                {showOwner && (
                  <td className={tdClass}>
                    {lead.assignedTo?.fullName ?? <em>Unassigned</em>}
                    {lead.autoAssigned && <div className="text-xs text-neutral-500">round-robin</div>}
                  </td>
                )}
                <td className={tdClass}>
                  {variant === "won" ? (
                    lead.closedAt ? formatDate(lead.closedAt) : "-"
                  ) : lead.nextFollowUpAt ? (
                    <span className={overdue ? "font-semibold text-red-600 dark:text-red-400" : ""}>
                      {formatDateTime(lead.nextFollowUpAt)}
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
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between px-1 text-sm text-neutral-500">
      <span>
        {total} lead{total === 1 ? "" : "s"}
      </span>
      {lastPage > 1 && (
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="font-medium text-brand-700 hover:underline dark:text-brand-300 disabled:opacity-40 disabled:no-underline">
            Previous
          </button>
          <span>
            Page {page} of {lastPage}
          </span>
          <button disabled={page >= lastPage} onClick={() => onPage(page + 1)} className="font-medium text-brand-700 hover:underline dark:text-brand-300 disabled:opacity-40 disabled:no-underline">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
