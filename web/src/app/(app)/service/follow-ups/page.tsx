"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ServiceFollowUpItem } from "@/components/follow-up-item";
import { ErrorText, NoAccess, PageHeader } from "@/components/ui";
import { queryString } from "@/lib/api";
import { ServiceFollowUpWithJob } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

const TABS = [
  { state: "overdue", label: "Overdue" },
  { state: "upcoming", label: "Upcoming" },
  { state: "completed", label: "Completed" },
] as const;

/** Upcoming and overdue service follow-ups (#5), flagged like sales follow-ups. */
export default function ServiceFollowUpsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]["state"]>("overdue");
  const [onlyMine, setOnlyMine] = useState(false);
  const canRead = can(TAGS.SERVICE_READ);

  const overdue = useApi<ServiceFollowUpWithJob[]>(canRead ? "/service-follow-ups?state=overdue" : null);
  const list = useApi<ServiceFollowUpWithJob[]>(
    canRead ? `/service-follow-ups${queryString({ state: tab, assignedTo: onlyMine ? "me" : undefined })}` : null,
  );
  if (!canRead) return <NoAccess tag={TAGS.SERVICE_READ} />;

  return (
    <>
      <PageHeader title="Service follow-ups" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.state}
            onClick={() => setTab(t.state)}
            className={`rounded px-3 py-1 text-sm ${
              tab === t.state
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {t.label}
            {t.state === "overdue" && overdue.data ? ` (${overdue.data.length})` : ""}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Only jobs assigned to me
        </label>
      </div>
      <ErrorText error={list.error} />
      {list.data?.length === 0 && <p className="text-sm text-neutral-500">Nothing here.</p>}
      <ul className="space-y-2">
        {list.data?.map((f) => (
          <ServiceFollowUpItem
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
