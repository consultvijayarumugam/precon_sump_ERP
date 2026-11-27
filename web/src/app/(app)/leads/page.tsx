"use client";

import { Upload, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DateRangeFilter } from "@/components/date-range-filter";
import { LeadsTable, Pager } from "@/components/leads-table";
import { rangeFromParams, type DateRange } from "@/lib/date-range";
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
  LeadListItem,
  Paginated,
  PRODUCT_INTERESTS,
  PRODUCT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  TAGS,
} from "@/lib/crm";
import { useStages } from "@/lib/stages";
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
    stageId: params.get("stageId") ?? "",
    source: params.get("source") ?? "",
    productInterest: params.get("productInterest") ?? "",
    assignedToId: params.get("assignedToId") ?? "",
    search: params.get("search") ?? "",
    page: Number(params.get("page") ?? 1),
  };
  // "Added" date range (?period=month, or ?period=custom&createdFrom=..&createdTo=..); all time when absent.
  const period = params.get("period") ?? "";
  const added = rangeFromParams(period || null, params.get("createdFrom"), params.get("createdTo"));
  const dates = { period: period || undefined, createdFrom: added.from, createdTo: added.to };

  function setFilter(key: string, value: string | number) {
    const next = { ...filters, [key]: value, ...(key === "page" ? {} : { page: 1 }) };
    router.replace(`${pathname}${queryString({ ...next, ...dates, page: next.page > 1 ? next.page : undefined })}`);
  }

  function setAdded(r: DateRange) {
    const keep = r.preset === "custom" ? { period: "custom", createdFrom: r.from, createdTo: r.to } : { period: r.preset === "all" ? undefined : r.preset };
    router.replace(`${pathname}${queryString({ ...filters, ...keep, page: undefined })}`);
  }

  // Debounce typing in the search box before it hits the URL/API.
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    if (searchInput === filters.search) return;
    const t = setTimeout(() => setFilter("search", searchInput), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const canAssign = can(TAGS.LEADS_ASSIGN);
  const assignees = useApi<{ id: string; fullName: string; role: { name: string } }[]>(canAssign ? "/leads/assignees" : null);
  const stages = useStages();
  const { data, error, reload } = useApi<Paginated<LeadListItem>>(
    `/leads${queryString({ ...filters, createdFrom: added.from, createdTo: added.to, pageSize: PAGE_SIZE })}`,
  );
  // How many leads each stage holds under the other filters (search, dates, source, product, person).
  const countFilters = { search: filters.search, source: filters.source, productInterest: filters.productInterest, assignedToId: filters.assignedToId };
  const stageCounts = useApi<{ total: number; stages: { stageId: string | null; count: number }[] }>(
    `/leads/stage-counts${queryString({ ...countFilters, createdFrom: added.from, createdTo: added.to })}`,
  );
  const countOf = (stageId: string) => stageCounts.data?.stages.find((c) => c.stageId === stageId)?.count ?? 0;

  return (
    <>
      <PageHeader
        title={can(TAGS.LEADS_READ_ALL) ? "All leads" : "My leads"}
        action={
          (can(TAGS.LEADS_WRITE) || can(TAGS.LEADS_QUICK_ADD) || can(TAGS.LEADS_IMPORT)) && (
            <div className="flex flex-wrap gap-2">
              {can(TAGS.LEADS_IMPORT) && (
                <Link href="/leads/import" className={secondaryButtonClass}>
                  <Upload className="size-4" aria-hidden /> Import
                </Link>
              )}
              {can(TAGS.LEADS_WRITE) && (
                <Link href="/leads/new" className={secondaryButtonClass}>
                  New lead
                </Link>
              )}
              {can(TAGS.LEADS_QUICK_ADD) && (
                <LinkButton href="/leads/quick-add">
                  <Zap className="size-4" aria-hidden /> Quick add
                </LinkButton>
              )}
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
        <select
          className={inputClass}
          value={filters.stageId}
          onChange={(e) => {
            // Picking a stage replaces an older ?status= filter from a link.
            const next = { ...filters, stageId: e.target.value, status: "", page: 1 };
            router.replace(`${pathname}${queryString({ ...next, ...dates, page: undefined })}`);
          }}
          aria-label="Stage"
        >
          <option value="">
            {filters.status
              ? `Status: ${STATUS_LABELS[filters.status as keyof typeof STATUS_LABELS] ?? filters.status}`
              : `All stages${stageCounts.data ? ` (${stageCounts.data.total})` : ""}`}
          </option>
          {/* Every stage with how many leads it holds under the other filters; switched-off ones only while they hold leads. */}
          {stages.data
            ?.filter((s) => s.isActive || countOf(s.id) > 0 || s.id === filters.stageId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {stageCounts.data ? ` (${countOf(s.id)})` : ""}
                {s.isActive ? "" : " (switched off)"}
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
      <DateRangeFilter key={period} value={added} onChange={setAdded} count={data?.total} noun={["lead added", "leads added"]} />
      <ErrorText error={error} />
      {data && (
        <>
          <LeadsTable leads={data.items} onChanged={reload} />
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
