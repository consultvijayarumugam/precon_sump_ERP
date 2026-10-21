"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { StatusBadge } from "@/components/ui";
import { formatDate, formatDateTime, LeadListItem, PRODUCT_LABELS, SOURCE_LABELS, TAGS } from "@/lib/crm";

/** Lead list used by the Leads and Won pages. `variant="won"` shows the close date. */
export function LeadsTable({ leads, variant = "all" }: { leads: LeadListItem[]; variant?: "all" | "won" }) {
  const { can } = useAuth();
  const showOwner = can(TAGS.LEADS_READ_ALL);
  const [now] = useState(() => Date.now()); // fixed per render pass so rows agree

  if (leads.length === 0) return <p className="text-sm text-neutral-500">No leads match.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
          <tr>
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Phone</th>
            <th className="py-2 pr-3 font-medium">Product</th>
            <th className="py-2 pr-3 font-medium">Source</th>
            {variant === "all" && <th className="py-2 pr-3 font-medium">Status</th>}
            {showOwner && <th className="py-2 pr-3 font-medium">Salesperson</th>}
            <th className="py-2 font-medium">{variant === "won" ? "Won on" : "Next follow-up"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {leads.map((lead) => {
            const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
            return (
              <tr key={lead.id}>
                <td className="py-2 pr-3">
                  <Link href={`/leads/${lead.id}`} className="font-medium underline">
                    {lead.name}
                  </Link>
                  {lead.city && <div className="text-xs text-neutral-500">{lead.city}</div>}
                </td>
                <td className="py-2 pr-3">
                  <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                </td>
                <td className="py-2 pr-3">{PRODUCT_LABELS[lead.productInterest]}</td>
                <td className="py-2 pr-3">{SOURCE_LABELS[lead.source]}</td>
                {variant === "all" && (
                  <td className="py-2 pr-3">
                    <StatusBadge status={lead.status} />
                  </td>
                )}
                {showOwner && <td className="py-2 pr-3">{lead.assignedTo?.fullName ?? <em>Unassigned</em>}</td>}
                <td className="py-2">
                  {variant === "won" ? (
                    lead.closedAt ? formatDate(lead.closedAt) : "-"
                  ) : lead.nextFollowUpAt ? (
                    <span className={overdue ? "font-medium text-red-600" : ""}>
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
    <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
      <span>
        {total} lead{total === 1 ? "" : "s"}
      </span>
      {lastPage > 1 && (
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="underline disabled:opacity-40">
            Previous
          </button>
          <span>
            Page {page} of {lastPage}
          </span>
          <button disabled={page >= lastPage} onClick={() => onPage(page + 1)} className="underline disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
