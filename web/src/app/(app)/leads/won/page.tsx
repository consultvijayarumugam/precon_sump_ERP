"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { LeadsTable, Pager } from "@/components/leads-table";
import { ErrorText, NoAccess, PageHeader } from "@/components/ui";
import { LeadListItem, Paginated, TAGS } from "@/lib/crm";
import { useApi } from "@/lib/use-api";

/** Closed/won leads (#3), most recently won first. */
export default function WonLeadsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const { data, error } = useApi<Paginated<LeadListItem>>(
    can(TAGS.LEADS_READ) ? `/leads?status=WON&page=${page}&pageSize=25` : null,
  );

  if (!can(TAGS.LEADS_READ)) return <NoAccess tag={TAGS.LEADS_READ} />;

  return (
    <>
      <PageHeader title={can(TAGS.LEADS_READ_ALL) ? "Won leads" : "My won leads"} />
      <ErrorText error={error} />
      {data && (
        <>
          <LeadsTable leads={data.items} variant="won" />
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
