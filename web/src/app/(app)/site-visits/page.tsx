"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { SiteVisitForm } from "@/components/site-visit-form";
import { buttonClass, ErrorText, NoAccess, PageHeader, secondaryButtonClass, TagChip } from "@/components/ui";
import { apiPost, queryString } from "@/lib/api";
import { formatDateOnly } from "@/lib/finance";
import { SiteVisit, SiteVisitTag } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

/** Site visits (#18) with tag filters. */
export default function SiteVisitsPage() {
  const { can } = useAuth();
  const canRead = can(TAGS.SITEVISIT_READ);
  const [tagId, setTagId] = useState("");
  const [adding, setAdding] = useState(false);
  const tags = useApi<SiteVisitTag[]>(canRead ? "/site-visit-tags?includeInactive=true" : null);
  const visits = useApi<SiteVisit[]>(canRead ? `/site-visits${queryString({ tagId })}` : null);
  if (!canRead) return <NoAccess tag={TAGS.SITEVISIT_READ} />;

  return (
    <>
      <PageHeader
        title="Site visits"
        action={
          <div className="flex gap-2">
            {can(TAGS.SITEVISIT_MANAGE_TAGS) && <Link href="/site-visits/tags" className={secondaryButtonClass}>Manage tags</Link>}
            {can(TAGS.SITEVISIT_WRITE) && !adding && (
              <button className={buttonClass} onClick={() => setAdding(true)}>
                Record visit
              </button>
            )}
          </div>
        }
      />
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
            <p className="text-xs text-neutral-500">
              {v.siteAddress}
              {v.installation && ` · ${v.installation.orderNumberLabel} installation`}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
