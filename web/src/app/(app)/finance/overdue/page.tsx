"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ErrorText,
  NoAccess,
  overdueRowClass,
  OverdueTag,
  PageHeader,
  secondaryButtonCompactClass,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { formatDateOnly, formatINR, OverdueOrder } from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

interface OverdueReport {
  asOf: string;
  count: number;
  totalOverdue: string;
  items: OverdueOrder[];
}

/** Balance overdue (#13): orders with money still owed after the due date. */
export default function OverduePage() {
  const { can } = useAuth();
  const [sort, setSort] = useState<"oldest" | "largest">("oldest");
  const { data, error } = useApi<OverdueReport>(
    can(TAGS.PAYMENTS_READ) ? `/finance/overdue-balances?sort=${sort}` : null,
  );
  if (!can(TAGS.PAYMENTS_READ)) return <NoAccess tag={TAGS.PAYMENTS_READ} />;

  return (
    <>
      <PageHeader title="Balance overdue" />
      <ErrorText error={error} />
      {data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 dark:border-red-900 dark:bg-red-950/40">
              <div className="text-lg font-semibold text-red-700 dark:text-red-300">{formatINR(data.totalOverdue)}</div>
              <div className="text-xs text-neutral-500">
                overdue across {data.count} order{data.count === 1 ? "" : "s"} as of {formatDateOnly(data.asOf)}
              </div>
            </div>
            <div className="flex gap-2 text-sm">
              Sort:
              {(["oldest", "largest"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`${secondaryButtonCompactClass} ${sort === s ? "bg-neutral-200 dark:bg-neutral-800" : ""}`}
                >
                  {s === "oldest" ? "Most days overdue" : "Largest balance"}
                </button>
              ))}
            </div>
          </div>
          {data.items.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing overdue. 🎉</p>
          ) : (
            <div className={tableWrapClass}>
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>Order</th>
                    <th className={thClass}>Customer</th>
                    <th className={thClass}>Salesperson</th>
                    <th className={`${thClass} text-right`}>Total</th>
                    <th className={`${thClass} text-right`}>Received</th>
                    <th className={`${thClass} text-right`}>Balance</th>
                    <th className={thClass}>Was due</th>
                  </tr>
                </thead>
                <tbody className={tbodyClass}>
                  {data.items.map((o) => (
                    <tr key={o.id} className={overdueRowClass}>
                      <td className={tdClass}>
                        <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                          {o.orderNumberLabel}
                        </Link>
                      </td>
                      <td className={tdClass}>
                        {o.customerName}
                        <div className="text-xs">
                          <a href={`tel:${o.lead.phone}`} className="text-neutral-500">
                            {o.lead.phone}
                          </a>
                        </div>
                      </td>
                      <td className={tdClass}>{o.salesperson.fullName}</td>
                      <td className={`${tdClass} text-right`}>{formatINR(o.totalAmount)}</td>
                      <td className={`${tdClass} text-right`}>{formatINR(o.amountPaid!)}</td>
                      <td className={`${tdClass} text-right font-semibold text-red-700 dark:text-red-300`}>
                        {formatINR(o.balanceDue!)}
                      </td>
                      <td className={tdClass}>
                        {formatDateOnly(o.dueDate)}
                        <div>
                          <OverdueTag days={o.daysOverdue} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
