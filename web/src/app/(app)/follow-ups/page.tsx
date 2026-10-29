"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ALL_TIME, DateRange, DateRangeFilter } from "@/components/date-range-filter";
import { FollowUpItem } from "@/components/follow-up-item";
import { ErrorText, NoAccess, PageHeader } from "@/components/ui";
import { queryString } from "@/lib/api";
import { FollowUpWithLead, TAGS } from "@/lib/crm";
import { useApi } from "@/lib/use-api";

const TABS = [
  { state: "overdue", label: "Overdue" },
  { state: "upcoming", label: "Upcoming" },
  { state: "completed", label: "Completed" },
] as const;

/** Upcoming and overdue follow-ups (#2). */
export default function FollowUpsPage() {
  const { can } = useAuth();
  const canSeeAll = can(TAGS.LEADS_READ_ALL);
  const [tab, setTab] = useState<(typeof TABS)[number]["state"]>("overdue");
  const [onlyMine, setOnlyMine] = useState(false);
  const [range, setRange] = useState<DateRange>(ALL_TIME);

  // The date filter (on the follow-up's due date) combines with the tab and "Only my leads",
  // and only narrows what you can already see.
  const filters = { assignedTo: onlyMine ? "me" : undefined, fromDate: range.from, toDate: range.to };
  const path = `/follow-ups${queryString({ state: tab, ...filters })}`;
  const overdue = useApi<FollowUpWithLead[]>(can(TAGS.LEADS_READ) ? `/follow-ups${queryString({ state: "overdue", ...filters })}` : null);
  const list = useApi<FollowUpWithLead[]>(can(TAGS.LEADS_READ) ? path : null);
  const tabLabel = TABS.find((t) => t.state === tab)!.label.toLowerCase();

  if (!can(TAGS.LEADS_READ)) return <NoAccess tag={TAGS.LEADS_READ} />;

  return (
    <>
      <PageHeader title="Follow-ups" subtitle="Filtered by the date each follow-up is due." />
      <DateRangeFilter value={range} onChange={setRange} count={list.data?.length} noun={[`${tabLabel} follow-up`, `${tabLabel} follow-ups`]} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-[var(--ps-tint-50)] p-0.5 text-sm font-semibold" role="tablist" aria-label="Follow-up state">
          {TABS.map((t) => (
            <button
              key={t.state}
              type="button"
              role="tab"
              aria-selected={tab === t.state}
              onClick={() => setTab(t.state)}
              className={`rounded-md px-3 py-1.5 ${
                tab === t.state ? "bg-[var(--ps-card)] text-[var(--ps-ink)] shadow-sm" : "text-[var(--ps-ink-2)] hover:text-[var(--ps-ink)]"
              }`}
            >
              {t.label}
              {t.state === "overdue" && overdue.data ? (
                <span className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${overdue.data.length ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "text-[var(--ps-ink-3)]"}`}>
                  {overdue.data.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {canSeeAll && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Only my leads
          </label>
        )}
      </div>
      <ErrorText error={list.error} />
      {list.data?.length === 0 && <p className="text-sm text-neutral-500">No {tabLabel} follow-ups in this period.</p>}
      <ul className="space-y-2">
        {list.data?.map((f) => (
          <FollowUpItem
            key={f.id}
            followUp={f}
            onChange={() => {
              list.reload();
              overdue.reload();
            }}
          />
        ))}
      </ul>
    </>
  );
}
