"use client";

import { CalendarClock, Contact, PhoneCall, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ErrorText, panelClass, StatusBadge } from "@/components/ui";
import { LeadListItem, Paginated, productInterestLabel } from "@/lib/crm";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";
import {
  FollowUpsDueList,
  Greeting,
  KpiRow,
  KpiTile,
  PermissionTagsFooter,
  SectionHeader,
  useCrmSummary,
  useDayRanges,
  useFollowUpsDue,
  WeekAhead,
} from "./shared";

/**
 * TELECALLER: a lighter sales view with no money anywhere. Who to call today
 * (overdue first, in red), the week ahead, and my assigned leads with
 * tap-to-call numbers.
 */
export function TelecallerDashboard() {
  const { can } = useAuth();
  const leads = can(TAGS.LEADS_READ);
  const summary = useCrmSummary(leads);
  const due = useFollowUpsDue(leads);
  const assigned = useApi<Paginated<LeadListItem>>(leads ? "/leads?pageSize=8" : null);
  const { now } = useDayRanges();

  const overdue = due.data?.filter((f) => new Date(f.scheduledAt) < now).length ?? 0;
  const laterToday = due.data ? due.data.length - overdue : null;

  return (
    <div className="space-y-8">
      <Greeting subtitle="Your calls for today and the leads assigned to you" />

      <ErrorText error={summary.error ?? due.error ?? assigned.error} />
      <KpiRow>
        <KpiTile label="My assigned leads" value={summary.data?.openLeads} hint="Open, not yet won or lost" href="/leads" icon={Contact} module="crm" />
        <KpiTile label="Calls still to make today" value={laterToday} href="/follow-ups" icon={PhoneCall} module="crm" />
        <KpiTile
          label="Overdue calls"
          value={due.data ? overdue : null}
          hint={due.data && overdue === 0 ? "Nothing overdue" : undefined}
          href="/follow-ups"
          icon={TriangleAlert}
          module="crm"
          alert={overdue > 0}
        />
        <KpiTile label="Upcoming follow-ups" value={summary.data?.upcomingFollowUps} href="/calendar" icon={CalendarClock} module="home" />
      </KpiRow>

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="xl:col-span-3">
          <SectionHeader title="Calls to make today" module="crm" href="/follow-ups" />
          <FollowUpsDueList
            data={due.data}
            error={due.error}
            emptyText="No calls due today. 🎉"
            onChange={() => {
              due.reload();
              summary.reload();
            }}
          />
        </section>
        <section className="space-y-6 xl:col-span-2">
          <div>
            <SectionHeader title="My week ahead" module="crm" href="/calendar" linkLabel="Calendar" />
            <WeekAhead enabled={leads} />
          </div>
          <div>
            <SectionHeader title="My assigned leads" module="crm" href="/leads" />
            <ul className={`${panelClass} divide-y divide-neutral-100 px-4 text-sm dark:divide-neutral-800`}>
              {assigned.data?.items.length === 0 && (
                <li className="py-4 text-neutral-500">No leads are assigned to you yet. Ask an admin to assign some.</li>
              )}
              {assigned.data?.items.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/leads/${lead.id}`} className="block truncate font-medium text-brand-700 hover:underline dark:text-brand-300">
                      {lead.name}
                    </Link>
                    <span className="text-xs text-neutral-500">
                      <a href={`tel:${lead.phone}`} className="font-medium text-neutral-700 hover:underline dark:text-neutral-300">
                        {lead.phone}
                      </a>{" "}
                      · {productInterestLabel(lead)}
                    </span>
                  </div>
                  <StatusBadge status={lead.status} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
      <PermissionTagsFooter />
    </div>
  );
}
