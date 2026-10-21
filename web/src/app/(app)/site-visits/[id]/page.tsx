"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { SiteVisitForm } from "@/components/site-visit-form";
import {
  ErrorText,
  NoAccess,
  secondaryButtonCompactClass,
  TagChip,
} from "@/components/ui";
import { apiPatch } from "@/lib/api";
import { formatDate } from "@/lib/crm";
import { formatDateOnly } from "@/lib/finance";
import { SiteVisit } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

export default function SiteVisitPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data: visit, error, reload } = useApi<SiteVisit>(can(TAGS.SITEVISIT_READ) ? `/site-visits/${id}` : null);
  const [editing, setEditing] = useState(false);

  if (!can(TAGS.SITEVISIT_READ)) return <NoAccess tag={TAGS.SITEVISIT_READ} />;
  if (error) return <ErrorText error={error} />;
  if (!visit) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/site-visits" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
          ← Site visits
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{visit.customerName}</h1>
          {visit.tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
          {can(TAGS.SITEVISIT_WRITE) && !editing && (
            <button className={secondaryButtonCompactClass} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <SiteVisitForm
          initial={visit}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await apiPatch(`/site-visits/${id}`, values);
            setEditing(false);
            reload();
          }}
        />
      ) : (
        <section className="grid gap-x-8 gap-y-2.5 rounded-lg border border-neutral-200 bg-white p-5 text-sm shadow-xs sm:grid-cols-2 dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <span className="text-neutral-500">Date: </span>
            {formatDateOnly(visit.visitDate)}
          </div>
          <div>
            <span className="text-neutral-500">Visited by: </span>
            {visit.person.fullName}
          </div>
          <div className="sm:col-span-2">
            <span className="text-neutral-500">Site: </span>
            {visit.siteAddress}
          </div>
          <div className="sm:col-span-2">
            <span className="text-neutral-500">Purpose: </span>
            {visit.purpose}
          </div>
          {visit.notes && (
            <div className="sm:col-span-2">
              <span className="text-neutral-500">Notes: </span>
              {visit.notes}
            </div>
          )}
          {visit.installation && (
            <div>
              <span className="text-neutral-500">Installation: </span>
              {can(TAGS.INSTALLATIONS_READ) ? (
                <Link href={`/installations/${visit.installation.id}`} className="text-brand-700 hover:underline dark:text-brand-300">
                  {visit.installation.orderNumberLabel}
                </Link>
              ) : (
                visit.installation.orderNumberLabel
              )}
            </div>
          )}
          <div>
            <span className="text-neutral-500">Recorded: </span>
            {formatDate(visit.createdAt)} by {visit.createdBy.fullName}
          </div>
        </section>
      )}
    </div>
  );
}
