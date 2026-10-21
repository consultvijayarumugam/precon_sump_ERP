"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { SiteVisitForm } from "@/components/site-visit-form";
import { ErrorText, NoAccess, secondaryButtonClass, TagChip } from "@/components/ui";
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
        <Link href="/site-visits" className="text-sm text-neutral-500 underline">
          ← Site visits
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{visit.customerName}</h1>
          {visit.tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
          {can(TAGS.SITEVISIT_WRITE) && !editing && (
            <button className={secondaryButtonClass + " py-1"} onClick={() => setEditing(true)}>
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
        <section className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
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
                <Link href={`/installations/${visit.installation.id}`} className="underline">
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
