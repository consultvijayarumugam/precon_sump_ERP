"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CallButton } from "@/components/call-button";
import {
  overdueRowClass,
  panelClass,
  StatusBadge,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { formatDate, formatDateTime, LeadListItem, productInterestLabel, SOURCE_LABELS, TAGS } from "@/lib/crm";

/** Lead list used by the Leads and Won pages. `variant="won"` shows the close date. */
export function LeadsTable({ leads, variant = "all", onChanged }: { leads: LeadListItem[]; variant?: "all" | "won"; onChanged?: () => void }) {
  const { can } = useAuth();
  // Admins see every owner; telecallers see who has the leads they handed over.
  const showOwner = can(TAGS.LEADS_READ_ALL) || can(TAGS.LEADS_QUALIFY);
  const [now] = useState(() => Date.now()); // fixed per render pass so rows agree

  if (leads.length === 0) return <p className="text-sm text-neutral-500">No leads match.</p>;

  return (
    <>
      {/* Phones get cards, so Call and WhatsApp are never scrolled out of reach. */}
      <ul className="space-y-3 sm:hidden">
        {leads.map((lead) => {
          const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
          return (
            <li key={lead.id} className={`${panelClass} p-4 ${overdue ? "border-red-200 dark:border-red-900" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/leads/${lead.id}`} className="text-base font-semibold text-brand-700 dark:text-brand-300">
                  {lead.name}
                </Link>
                {variant === "all" && <StatusBadge status={lead.status} stage={lead.stage} />}
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                {[lead.city, productInterestLabel(lead), SOURCE_LABELS[lead.source], showOwner ? (lead.assignedTo?.fullName ?? "Unassigned") : null].filter(Boolean).join(" · ")}
              </p>
              {variant === "won" ? (
                lead.closedAt && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Won on {formatDate(lead.closedAt)}</p>
              ) : (
                lead.nextFollowUpAt && (
                  <p className={`mt-1 text-sm ${overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-400"}`}>
                    Next: {formatDateTime(lead.nextFollowUpAt)}
                    {overdue && " (overdue)"}
                  </p>
                )
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <CallButton leadId={lead.id} phone={lead.phone} name={lead.name} variant="block" onLogged={onChanged} />
                <WhatsAppButton leadId={lead.id} name={lead.name} variant="block" direct={lead.source === "WHATSAPP"} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className={`hidden sm:block ${tableWrapClass}`}>
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
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="select-all tabular-nums">{lead.phone}</span>
                    <span className="ml-auto flex gap-1.5">
                      <CallButton leadId={lead.id} phone={lead.phone} name={lead.name} onLogged={onChanged} />
                      <WhatsAppButton leadId={lead.id} name={lead.name} variant="icon" direct={lead.source === "WHATSAPP"} />
                    </span>
                  </div>
                </td>
                <td className={tdClass}>{productInterestLabel(lead)}</td>
                <td className={tdClass}>{SOURCE_LABELS[lead.source]}</td>
                {variant === "all" && (
                  <td className={tdClass}>
                    <StatusBadge status={lead.status} stage={lead.stage} />
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
    </>
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
