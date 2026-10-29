"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ALL_TIME, DateRange, DateRangeFilter } from "@/components/date-range-filter";
import { LeadsTable, Pager } from "@/components/leads-table";
import { ErrorText, NoAccess, PageHeader } from "@/components/ui";
import { queryString } from "@/lib/api";
import { LeadListItem, Paginated, TAGS } from "@/lib/crm";
import { useApi } from "@/lib/use-api";

/** Closed/won leads (#3), most recently won first. */
export default function WonLeadsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  // The date filter narrows what you can already see (a salesperson: only their own).
  const { data, error } = useApi<Paginated<LeadListItem>>(
    can(TAGS.LEADS_READ)
      ? `/leads${queryString({ status: "WON", wonFrom: range.from, wonTo: range.to, page, pageSize: 25 })}`
      : null,
  );

  if (!can(TAGS.LEADS_READ)) return <NoAccess tag={TAGS.LEADS_READ} />;

  return (
    <>
      <PageHeader title={can(TAGS.LEADS_READ_ALL) ? "Won leads" : "My won leads"} subtitle="Filtered by the date each lead was won." />
      <DateRangeFilter
        value={range}
        onChange={(r) => {
          setRange(r);
          setPage(1);
        }}
        count={data?.total}
        noun={["won lead", "won leads"]}
      />
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
