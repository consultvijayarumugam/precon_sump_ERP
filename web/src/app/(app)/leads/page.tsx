"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { LeadsTable, Pager } from "@/components/leads-table";
import {
  ErrorText,
  inputClass,
  LinkButton,
  NoAccess,
  PageHeader,
  secondaryButtonClass,
} from "@/components/ui";
import { queryString } from "@/lib/api";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  LeadListItem,
  Paginated,
  PRODUCT_INTERESTS,
  PRODUCT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  TAGS,
} from "@/lib/crm";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 25;

/** Filters live in the URL (?status=QUOTED&search=...) so views can be linked and bookmarked. */
function LeadsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useAuth();

  const filters = {
    status: params.get("status") ?? "",
    source: params.get("source") ?? "",
    productInterest: params.get("productInterest") ?? "",
    assignedToId: params.get("assignedToId") ?? "",
    search: params.get("search") ?? "",
    page: Number(params.get("page") ?? 1),
  };

  // Debounce typing in the search box before it hits the URL/API.
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    if (searchInput === filters.search) return;
    const t = setTimeout(() => setFilter("search", searchInput), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function setFilter(key: string, value: string | number) {
    const next = { ...filters, [key]: value, ...(key === "page" ? {} : { page: 1 }) };
    router.replace(`${pathname}${queryString({ ...next, page: next.page > 1 ? next.page : undefined })}`);
  }

  const canAssign = can(TAGS.LEADS_ASSIGN);
  const assignees = useApi<{ id: string; fullName: string; role: { name: string } }[]>(canAssign ? "/leads/assignees" : null);
  const { data, error } = useApi<Paginated<LeadListItem>>(
    `/leads${queryString({ ...filters, pageSize: PAGE_SIZE })}`,
  );

  return (
    <>
      <PageHeader
        title={can(TAGS.LEADS_READ_ALL) ? "All leads" : "My leads"}
        action={
          can(TAGS.LEADS_WRITE) && (
            <div className="flex gap-2">
              <Link href="/leads/import" className={secondaryButtonClass}>
                <Upload className="size-4" aria-hidden /> Import
              </Link>
              <LinkButton href="/leads/new">New lead</LinkButton>
            </div>
          )
        }
      />
      <div className={`mb-4 grid gap-2 ${canAssign ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        <input
          className={inputClass}
          placeholder="Search name, phone, city"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select className={inputClass} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className={inputClass} value={filters.source} onChange={(e) => setFilter("source", e.target.value)}>
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={filters.productInterest}
          onChange={(e) => setFilter("productInterest", e.target.value)}
        >
          <option value="">All products</option>
          {PRODUCT_INTERESTS.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_LABELS[p]}
            </option>
          ))}
        </select>
        {canAssign && (
          <select className={inputClass} value={filters.assignedToId} onChange={(e) => setFilter("assignedToId", e.target.value)}>
            <option value="">Everyone</option>
            {assignees.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName} ({a.role.name})
              </option>
            ))}
          </select>
        )}
      </div>
      <ErrorText error={error} />
      {data && (
        <>
          <LeadsTable leads={data.items} />
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setFilter("page", p)} />
        </>
      )}
    </>
  );
}

export default function LeadsPage() {
  const { can } = useAuth();
  if (!can(TAGS.LEADS_READ)) return <NoAccess tag={TAGS.LEADS_READ} />;
  return (
    <Suspense>
      <LeadsView />
    </Suspense>
  );
}
