"use client";

import { MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CheckInButton, VisitsMap } from "@/components/check-in";
import { SiteVisitForm } from "@/components/site-visit-form";
import { buttonClass, ErrorText, NoAccess, PageHeader, panelClass, secondaryButtonClass, TagChip } from "@/components/ui";
import { apiPost, queryString } from "@/lib/api";
import { formatDateTime } from "@/lib/crm";
import { formatDateOnly } from "@/lib/finance";
import { SiteVisit, SiteVisitTag } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

/** Site visits (#18) with tag filters, and GPS check-ins as pins on an OSM map. Salespeople see only their own. */
export default function SiteVisitsPage() {
  const { can, operations } = useAuth();
  const canRead = can(TAGS.SITEVISIT_READ);
  const [tagId, setTagId] = useState("");
  const [adding, setAdding] = useState(false);
  const tags = useApi<SiteVisitTag[]>(canRead ? "/site-visit-tags?includeInactive=true" : null);
  const visits = useApi<SiteVisit[]>(canRead ? `/site-visits${queryString({ tagId })}` : null);
  if (!canRead) return <NoAccess tag={TAGS.SITEVISIT_READ} />;
  const located = visits.data?.filter((v) => v.latitude !== null).length ?? 0;

  return (
    <>
      <PageHeader
        title="Site visits"
        action={
          <div className="flex gap-2">
            {can(TAGS.SITEVISIT_MANAGE_TAGS) && <Link href="/site-visits/tags" className={secondaryButtonClass}>Manage tags</Link>}
            {/* The free-form visit (not tied to a lead) belongs to the operations modules. */}
            {operations && can(TAGS.SITEVISIT_WRITE) && !adding && (
              <button className={buttonClass} onClick={() => setAdding(true)}>
                Record visit
              </button>
            )}
          </div>
        }
      />
      {can(TAGS.SITEVISIT_WRITE) && (
        <section className={`${panelClass} mb-6 p-4`}>
          <h2 className="mb-2 font-semibold">Check in at a lead&apos;s site</h2>
          <CheckInButton onCheckedIn={() => visits.reload()} />
        </section>
      )}
      {adding && (
        <div className="mb-6">
          <SiteVisitForm
            submitLabel="Save visit"
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              await apiPost("/site-visits", values);
              setAdding(false);
              visits.reload();
              tags.reload();
            }}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Filter:</span>
        <button
          className={`rounded-full border px-2 py-0.5 text-xs ${tagId === "" ? "border-neutral-900 dark:border-white" : "border-neutral-300 dark:border-neutral-700"}`}
          onClick={() => setTagId("")}
        >
          All
        </button>
        {tags.data?.map((t) => (
          <TagChip key={t.id} tag={t} selected={tagId === t.id} onClick={() => setTagId(tagId === t.id ? "" : t.id)} />
        ))}
      </div>

      <ErrorText error={visits.error ?? tags.error} />
      {visits.data && visits.data.length > 0 && (
        <section className={`${panelClass} mb-6 p-4`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Where the visits were</h2>
            <span className="text-xs text-neutral-500">
              {located} of {visits.data.length} with a GPS check-in · tap a pin to open the visit
            </span>
          </div>
          <VisitsMap visits={visits.data} height={400} link emptyText="None of these visits has a GPS location yet." />
        </section>
      )}
      {visits.data?.length === 0 && <p className="text-sm text-neutral-500">No site visits match.</p>}
      <ul className="space-y-2">
        {visits.data?.map((v) => (
          <li key={v.id} className="rounded-lg border border-neutral-200 bg-white shadow-xs p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{formatDateOnly(v.visitDate)}</span>
                <Link href={`/site-visits/${v.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                  {v.customerName}
                </Link>
                {v.tags.map((t) => (
                  <TagChip key={t.id} tag={t} />
                ))}
              </div>
              <span className="text-neutral-500">by {v.person.fullName}</span>
            </div>
            <p className="mt-1">{v.purpose}</p>
            {v.notes && <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">{v.notes}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
              {v.latitude !== null && v.checkedInAt && (
                <Link
                  href={`/site-visits/${v.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-300"
                >
                  <MapPin className="size-3" aria-hidden /> Checked in {formatDateTime(v.checkedInAt)} · view map
                </Link>
              )}
              <span>
                {v.siteAddress}
                {v.installation && ` · ${v.installation.orderNumberLabel} installation`}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
