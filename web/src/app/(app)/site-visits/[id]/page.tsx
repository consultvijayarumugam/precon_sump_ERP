"use client";

import { Clock, ExternalLink, MapPin, StickyNote, User, UserRound } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ReactNode, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { osmLink, VisitsMap } from "@/components/check-in";
import { SiteVisitForm } from "@/components/site-visit-form";
import {
  ErrorText,
  NoAccess,
  secondaryButtonCompactClass,
  TagChip,
} from "@/components/ui";
import { apiPatch } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/crm";
import { formatDateOnly } from "@/lib/finance";
import { SiteVisit } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

export default function SiteVisitPage() {
  const { id } = useParams<{ id: string }>();
  const { can, operations } = useAuth();
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
        <>
          {visit.latitude !== null && visit.longitude !== null && (
            <section className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <VisitsMap visits={[visit]} height={380} />
              </div>
              <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5 text-sm shadow-xs lg:col-span-2 dark:border-neutral-800 dark:bg-neutral-900">
                <h2 className="text-base font-semibold">GPS check-in</h2>
                <Detail icon={UserRound} label="Checked in by">{visit.person.fullName}</Detail>
                <Detail icon={User} label="Lead">
                  {visit.lead ? (
                    <Link href={`/leads/${visit.lead.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                      {visit.lead.name}
                    </Link>
                  ) : (
                    visit.customerName
                  )}
                  {visit.lead?.city && <span className="text-neutral-500"> · {visit.lead.city}</span>}
                </Detail>
                {visit.checkedInAt && <Detail icon={Clock} label="Time">{formatDateTime(visit.checkedInAt)}</Detail>}
                <Detail icon={MapPin} label="Location">
                  <span className="tabular-nums">
                    {visit.latitude.toFixed(5)}, {visit.longitude.toFixed(5)}
                  </span>
                  {visit.accuracyMeters !== null && <span className="text-neutral-500"> (accurate to about {visit.accuracyMeters} m)</span>}
                  <a
                    href={osmLink(visit.latitude, visit.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    Open in OpenStreetMap <ExternalLink className="size-3" aria-hidden />
                  </a>
                </Detail>
                <Detail icon={StickyNote} label="Note">{visit.notes ?? <span className="text-neutral-500">No note</span>}</Detail>
              </div>
            </section>
          )}
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
                {can(TAGS.INSTALLATIONS_READ) && operations ? (
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
        </>
      )}
    </div>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
      <div className="min-w-0">
        <div className="text-xs text-neutral-500">{label}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}
