"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Pager } from "@/components/leads-table";
import {
  ErrorText,
  inputClass,
  NoAccess,
  OrderStatusBadge,
  OverdueTag,
  overdueRowClass,
  PageHeader,
  tableClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { queryString } from "@/lib/api";
import { Paginated } from "@/lib/crm";
import { formatDateOnly, formatINR, ORDER_STATUS_LABELS, ORDER_STATUSES, SalesOrder } from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

/** Sales orders (#7). Salespeople see their own; sales.read_all sees all. */
export default function OrdersPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const showPayments = can(TAGS.PAYMENTS_READ);
  const showSalesperson = can(TAGS.SALES_READ_ALL);

  const { data, error } = useApi<Paginated<SalesOrder>>(
    can(TAGS.SALES_READ) ? `/sales-orders${queryString({ status, page, pageSize: 25 })}` : null,
  );
  if (!can(TAGS.SALES_READ)) return <NoAccess tag={TAGS.SALES_READ} />;

  return (
    <>
      <PageHeader title={showSalesperson ? "Sales orders" : "My sales orders"} />
      <p className="mb-4 text-sm text-neutral-500">
        New orders are created from a won lead: open the lead and choose <em>Convert to sales order</em>.
      </p>
      <div className="mb-4 max-w-xs">
        <select
          className={inputClass}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <ErrorText error={error} />
      {data && data.items.length === 0 && <p className="text-sm text-neutral-500">No orders yet.</p>}
      {data && data.items.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Order</th>
                  <th className={thClass}>Customer</th>
                  <th className={thClass}>Product</th>
                  <th className={`${thClass} text-right`}>Total</th>
                  {showPayments && <th className={`${thClass} text-right`}>Balance</th>}
                  <th className={thClass}>Ordered</th>
                  <th className={thClass}>Due</th>
                  <th className={thClass}>Status</th>
                  {showSalesperson && <th className={thClass}>Salesperson</th>}
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {data.items.map((o) => (
                  <tr key={o.id} className={o.isOverdue ? overdueRowClass : ""}>
                    <td className={tdClass}>
                      <Link href={`/orders/${o.id}`} className="font-medium underline">
                        {o.orderNumberLabel}
                      </Link>
                    </td>
                    <td className={tdClass}>{o.customerName}</td>
                    <td className={tdClass}>
                      {o.product.name}
                      <div className="text-xs text-neutral-500">
                        {o.quantity} {o.product.unit}
                      </div>
                    </td>
                    <td className={`${tdClass} text-right`}>{formatINR(o.totalAmount)}</td>
                    {showPayments && (
                      <td className={`${tdClass} text-right`}>
                        {Number(o.balanceDue) > 0 ? formatINR(o.balanceDue!) : <span className="text-green-700">Paid</span>}
                        {o.isOverdue && (
                          <div>
                            <OverdueTag />
                          </div>
                        )}
                      </td>
                    )}
                    <td className={tdClass}>{formatDateOnly(o.orderDate)}</td>
                    <td className={tdClass}>{formatDateOnly(o.dueDate)}</td>
                    <td className={tdClass}>
                      <OrderStatusBadge status={o.status} />
                    </td>
                    {showSalesperson && <td className={tdClass}>{o.salesperson.fullName}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
