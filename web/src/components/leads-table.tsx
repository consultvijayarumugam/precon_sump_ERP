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
import { isHandedOver, ReassignSalesperson } from "@/components/lead-handover";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { formatDate, formatDateTime, LeadListItem, productInterestLabel, SOURCE_LABELS, TAGS } from "@/lib/crm";
import { leadLabel } from "@/lib/phone";

/** Lead list used by the Leads and Won pages. `variant="won"` shows the close date. */
export function LeadsTable({ leads, variant = "all", onChanged }: { leads: LeadListItem[]; variant?: "all" | "won"; onChanged?: () => void }) {
  const { can } = useAuth();
  // Everyone sees who has each lead (admins every owner, telecallers who has the leads
  // they handed over, salespeople their own), and a lead with nobody on it stands out.
  const showOwner = true;
  // Admins can hand a lead to a different salesperson right from the list.
  const canReassign = can(TAGS.LEADS_ASSIGN);
  const [reassigning, setReassigning] = useState<string | null>(null);
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
                  {leadLabel(lead)}
                </Link>
                {variant === "all" && <StatusBadge status={lead.status} stage={lead.stage} />}
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                {[lead.city, productInterestLabel(lead), SOURCE_LABELS[lead.source], showOwner ? (lead.assignedTo?.fullName ?? "Not assigned") : null].filter(Boolean).join(" · ")}
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
                <CallButton leadId={lead.id} phone={lead.phone} name={leadLabel(lead)} variant="block" onLogged={onChanged} />
                <WhatsAppButton leadId={lead.id} name={leadLabel(lead)} variant="block" direct={lead.source === "WHATSAPP"} />
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
                    {leadLabel(lead)}
                  </Link>
                  {lead.city && <div className="text-xs text-neutral-500">{lead.city}</div>}
                </td>
                <td className={tdClass}>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="select-all tabular-nums">{lead.phone}</span>
                    <span className="ml-auto flex gap-1.5">
                      <CallButton leadId={lead.id} phone={lead.phone} name={leadLabel(lead)} onLogged={onChanged} />
                      <WhatsAppButton leadId={lead.id} name={leadLabel(lead)} variant="icon" direct={lead.source === "WHATSAPP"} />
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
                    {lead.assignedTo?.fullName ?? <span className="font-semibold text-amber-700 dark:text-amber-300">Not assigned</span>}
                    {lead.autoAssigned && <div className="text-xs text-neutral-500">round-robin</div>}
                    {canReassign && isHandedOver(lead) && (
                      reassigning === lead.id ? (
                        <ReassignSalesperson
                          leadId={lead.id}
                          currentId={lead.assignedTo?.id ?? null}
                          onCancel={() => setReassigning(null)}
                          onDone={() => {
                            setReassigning(null);
                            onChanged?.();
                          }}
                        />
                      ) : (
                        <button type="button" onClick={() => setReassigning(lead.id)} className="block text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                          Reassign
                        </button>
                      )
                    )}
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
