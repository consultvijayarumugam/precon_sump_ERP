"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
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

  const path = `/follow-ups${queryString({ state: tab, assignedTo: onlyMine ? "me" : undefined })}`;
  const overdue = useApi<FollowUpWithLead[]>(can(TAGS.LEADS_READ) ? "/follow-ups?state=overdue" : null);
  const list = useApi<FollowUpWithLead[]>(can(TAGS.LEADS_READ) ? path : null);

  if (!can(TAGS.LEADS_READ)) return <NoAccess tag={TAGS.LEADS_READ} />;

  return (
    <>
      <PageHeader title="Follow-ups" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.state}
            onClick={() => setTab(t.state)}
            className={`rounded px-3 py-1 text-sm ${
              tab === t.state ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {t.label}
            {t.state === "overdue" && overdue.data ? ` (${overdue.data.length})` : ""}
          </button>
        ))}
        {canSeeAll && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Only my leads
          </label>
        )}
      </div>
      <ErrorText error={list.error} />
      {list.data?.length === 0 && <p className="text-sm text-neutral-500">Nothing here.</p>}
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
