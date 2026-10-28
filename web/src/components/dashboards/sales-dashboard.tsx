"use client";

import { IndianRupee, MapPin, Phone, Target, TriangleAlert, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CheckInButton, osmLink, VisitsMap } from "@/components/check-in";
import { LogCallPanel } from "@/components/lead-quick-actions";
import { ErrorText, panelClass, secondaryButtonSmClass } from "@/components/ui";
import { formatDate, formatDateTime, formatTime, productInterestLabel } from "@/lib/crm";
import { formatINR } from "@/lib/finance";
import { MODULES } from "@/lib/modules";
import { TAGS } from "@/lib/tags";
import { useAuth } from "@/components/auth-provider";
import { useApi } from "@/lib/use-api";
import { SalesDashboardData, SalesLead } from "@/lib/workflow";
import { EmptyNote, Greeting, KpiRow, KpiTile, SectionHeader } from "./shared";

const COLUMNS: { status: "QUALIFIED" | "QUOTED" | "WON" | "LOST"; title: string; tone: string }[] = [
  { status: "QUALIFIED", title: "Qualified", tone: "border-t-violet-500" },
  { status: "QUOTED", title: "Quoted", tone: "border-t-amber-500" },
  { status: "WON", title: "Won this month", tone: "border-t-emerald-500" },
  { status: "LOST", title: "Lost this month", tone: "border-t-neutral-400" },
];

function LeadCard({ lead, now }: { lead: SalesLead; now: number }) {
  const fu = lead.nextFollowUp;
  const late = fu && new Date(fu.scheduledAt).getTime() < now;
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="block rounded-lg border border-neutral-200 bg-white p-3 text-sm shadow-xs transition-colors hover:border-brand-300 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="font-semibold text-neutral-900 dark:text-white">{lead.name}</div>
      <div className="mt-0.5 text-xs text-neutral-500">
        {productInterestLabel(lead)}
        {lead.city && ` · ${lead.city}`}
      </div>
      {lead.qualifiedBy && (
        <div className="mt-1 text-xs text-neutral-500">
          From {lead.qualifiedBy.fullName}
          {lead.qualifiedAt && ` · ${formatDate(lead.qualifiedAt)}`}
        </div>
      )}
      {(lead.status === "QUALIFIED" || lead.status === "QUOTED") && (
        <div className={`mt-1.5 text-xs font-medium ${late ? "text-red-600 dark:text-red-400" : fu ? "text-neutral-600 dark:text-neutral-400" : "text-amber-700 dark:text-amber-300"}`}>
          {fu ? `${late ? "Overdue: " : "Next: "}${formatDateTime(fu.scheduledAt)}` : "No follow-up planned"}
        </div>
      )}
      {lead.closedAt && (lead.status === "WON" || lead.status === "LOST") && (
        <div className="mt-1 text-xs text-neutral-500">Closed {formatDate(lead.closedAt)}</div>
      )}
    </Link>
  );
}

function FollowUpRow({ f, onLogged }: { f: SalesDashboardData["followUps"][number]; onLogged: () => void }) {
  const [logging, setLogging] = useState(false);
  return (
    <li className={`px-4 py-3 ${f.overdue ? "bg-red-50/70 dark:bg-red-950/30" : "bg-red-50/30 dark:bg-red-950/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/leads/${f.lead.id}`} className="font-semibold hover:text-brand-700">
            {f.lead.name}
          </Link>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${f.overdue ? "bg-red-600 text-white" : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200"}`}>
            {f.overdue ? `Overdue · ${formatDateTime(f.scheduledAt)}` : `Today ${formatTime(f.scheduledAt)}`}
          </span>
          {f.note && <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{f.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <a href={`tel:${f.lead.phone}`} className={secondaryButtonSmClass}>
            <Phone className="size-4" aria-hidden /> {f.lead.phone}
          </a>
          {!logging && (
            <button type="button" className={secondaryButtonSmClass} onClick={() => setLogging(true)}>
              Log call
            </button>
          )}
        </div>
      </div>
      {logging && (
        <LogCallPanel
          leadId={f.lead.id}
          onCancel={() => setLogging(false)}
          onDone={() => {
            setLogging(false);
            onLogged();
          }}
        />
      )}
    </li>
  );
}

/** Sales landing page: the leads telecallers handed over, what's due, revenue and site visits. */
export function SalesDashboard() {
  const { can } = useAuth();
  const { data, error, reload } = useApi<SalesDashboardData>("/dashboards/sales");
  const [now] = useState(() => Date.now());
  const p = data?.pipeline;
  const overdue = data?.followUps.filter((f) => f.overdue).length ?? 0;
  const dueToday = (data?.followUps.length ?? 0) - overdue;

  return (
    <div className="space-y-6">
      <Greeting
        subtitle={
          data
            ? `${(p?.QUALIFIED ?? 0) + (p?.QUOTED ?? 0)} open deals · ${data.handedToday} new from telecallers today · ${overdue} follow-ups overdue`
            : "Your pipeline, follow-ups and site visits."
        }
      />
      <ErrorText error={error} />
      <KpiRow>
        {data?.revenueThisMonth !== null && (
          <KpiTile label="My revenue this month" value={data ? formatINR(data.revenueThisMonth ?? 0) : undefined} href="/leads/won" icon={IndianRupee} module="finance" />
        )}
        <KpiTile label="Won this month" value={p?.wonThisMonth} href="/leads/won" icon={Trophy} module="crm" hint={p && `${p.WON} won in total`} />
        <KpiTile label="Open pipeline" value={p ? p.QUALIFIED + p.QUOTED : undefined} href="/leads" icon={Target} module="crm" hint={p && `${p.QUALIFIED} qualified · ${p.QUOTED} quoted`} />
        <KpiTile
          label="Follow-ups overdue"
          value={overdue}
          href="/follow-ups"
          icon={TriangleAlert}
          module="crm"
          alert={overdue > 0}
          hint={`${dueToday} more due today`}
        />
      </KpiRow>

      <section>
        <SectionHeader title="Follow-ups: overdue and today" module="crm" href="/follow-ups" />
        {data && data.followUps.length === 0 ? (
          <EmptyNote>No follow-ups due today. 🎉</EmptyNote>
        ) : (
          <ul className={`${panelClass} divide-y divide-red-100 overflow-hidden dark:divide-red-950`}>
            {data?.followUps.map((f) => <FollowUpRow key={f.id} f={f} onLogged={reload} />)}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="My pipeline" module="crm" href="/leads" linkLabel="All my leads" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const leads =
              col.status === "QUALIFIED" || col.status === "QUOTED"
                ? (data?.open ?? []).filter((l) => l.status === col.status)
                : (data?.closedThisMonth ?? []).filter((l) => l.status === col.status);
            const count =
              col.status === "WON" ? p?.wonThisMonth : col.status === "LOST" ? p?.lostThisMonth : p?.[col.status];
            return (
              <div key={col.status} className={`rounded-xl border border-t-4 border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40 ${col.tone}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-semibold">{col.title}</h3>
                  <span className="text-2xl font-bold tabular-nums">{count ?? "–"}</span>
                </div>
                <div className="space-y-2">
                  {leads.slice(0, 8).map((l) => (
                    <LeadCard key={l.id} lead={l} now={now} />
                  ))}
                  {leads.length === 0 && <p className="py-4 text-center text-xs text-neutral-500">None</p>}
                  {leads.length > 8 && (
                    <Link href={`/leads?status=${col.status}`} className="block text-center text-xs font-semibold text-brand-700">
                      +{leads.length - 8} more →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {can(TAGS.SITEVISIT_READ) && (
        <section>
          <SectionHeader title="Site visits" module="operations" href="/site-visits" />
          <div className="grid gap-4 lg:grid-cols-5">
            <div className={`${panelClass} p-4 lg:col-span-2`}>
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <span className={`grid size-8 place-items-center rounded-lg ${MODULES.operations.chip}`}>
                  <MapPin className="size-4" aria-hidden />
                </span>
                Check in at a site
              </h3>
              {can(TAGS.SITEVISIT_WRITE) ? (
                <CheckInButton leads={data?.open ?? []} onCheckedIn={reload} />
              ) : (
                <p className="text-sm text-neutral-500">You can view visits but not check in.</p>
              )}
              <h4 className="mt-5 mb-2 text-sm font-semibold">My recent visits</h4>
              <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                {data?.visits.slice(0, 6).map((v) => (
                  <li key={v.id} className="py-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{v.lead ? <Link href={`/leads/${v.lead.id}`}>{v.lead.name}</Link> : v.customerName}</span>
                      <span className="shrink-0 text-xs text-neutral-500">{formatDateTime(v.checkedInAt)}</span>
                    </div>
                    <a href={osmLink(v.latitude, v.longitude)} target="_blank" rel="noreferrer" className="text-xs text-brand-700 hover:underline dark:text-brand-300">
                      {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                      {v.accuracyMeters !== null && ` (±${v.accuracyMeters} m)`}
                    </a>
                  </li>
                ))}
                {data && data.visits.length === 0 && <li className="py-2 text-neutral-500">No check-ins yet.</li>}
              </ul>
            </div>
            <div className="lg:col-span-3">{data && <VisitsMap visits={data.visits} height={420} />}</div>
          </div>
        </section>
      )}
    </div>
  );
}
