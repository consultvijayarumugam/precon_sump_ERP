"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  OrderStatusBadge,
  OverdueTag,
  secondaryButtonClass,
  Stat,
} from "@/components/ui";
import { api, apiPatch, apiPost } from "@/lib/api";
import { dayKey, formatDateTime } from "@/lib/crm";
import {
  formatDateOnly,
  formatINR,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  PaymentMode,
  SalesOrderDetail,
} from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

function RecordPayment({ order, onDone }: { order: SalesOrderDetail; onDone: () => void }) {
  const [amount, setAmount] = useState(order.balanceDue ?? "");
  const [paidOn, setPaidOn] = useState(() => dayKey(new Date()));
  const [mode, setMode] = useState<PaymentMode>("UPI");
  const [reference, setReference] = useState("");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      apiPost(`/sales-orders/${order.id}/payments`, {
        amount: Number(amount),
        paidOn,
        mode,
        reference: reference || undefined,
      }),
    );
    if (ok) {
      setReference("");
      onDone();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <h3 className="text-sm font-medium">Record a payment</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Amount (₹)">
          <input className={inputClass} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid on">
          <input className={inputClass} type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="Mode">
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference (UTR / cheque)">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      <ErrorText error={error} />
      <button type="submit" className={buttonClass} disabled={busy}>
        Save payment
      </button>
    </form>
  );
}

function EditOrder({ order, onDone }: { order: SalesOrderDetail; onDone: () => void }) {
  const delivered = order.status === "DELIVERED";
  const [quantity, setQuantity] = useState(String(order.quantity));
  const [totalAmount, setTotalAmount] = useState(order.totalAmount);
  const [dueDate, setDueDate] = useState(order.dueDate);
  const [notes, setNotes] = useState(order.notes ?? "");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      apiPatch(`/sales-orders/${order.id}`, {
        ...(delivered ? {} : { quantity: Number(quantity) }),
        totalAmount: Number(totalAmount),
        dueDate,
        notes,
      }),
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={`Quantity (${order.product.unit})`}>
          <input className={inputClass} type="number" min="1" required disabled={delivered} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Total (₹)">
          <input className={inputClass} type="number" min="0.01" step="0.01" required value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
        </Field>
        <Field label="Payment due">
          <input className={inputClass} type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          Save
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const { data: order, error, reload } = useApi<SalesOrderDetail>(can(TAGS.SALES_READ) ? `/sales-orders/${id}` : null);
  const [editing, setEditing] = useState(false);
  const action = useAction();

  if (!can(TAGS.SALES_READ)) return <NoAccess tag={TAGS.SALES_READ} />;
  if (error) return <ErrorText error={error} />;
  if (!order) return <p className="text-sm text-neutral-500">Loading…</p>;

  const confirmed = order.status === "CONFIRMED";
  const showPayments = can(TAGS.PAYMENTS_READ) && order.payments !== undefined;
  const balance = Number(order.balanceDue ?? 0);

  async function deliver() {
    if (!confirm(`Mark ${order!.orderNumberLabel} delivered? This takes ${order!.quantity} ${order!.product.unit} out of stock.`)) return;
    if (await action.run(() => apiPost(`/sales-orders/${id}/deliver`))) reload();
  }
  async function cancelOrder() {
    if (!confirm(`Cancel ${order!.orderNumberLabel}?`)) return;
    if (await action.run(() => apiPost(`/sales-orders/${id}/cancel`))) reload();
  }
  async function removePayment(paymentId: string) {
    if (!confirm("Remove this payment?")) return;
    if (await action.run(() => api(`/payments/${paymentId}`, { method: "DELETE" }))) reload();
  }

  return (
    <div className="space-y-8">
      <div>
        <button onClick={() => router.back()} className="text-sm text-neutral-500 underline">
          ← Back
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">
            {order.orderNumberLabel} · {order.customerName}
          </h1>
          <OrderStatusBadge status={order.status} />
          {order.isOverdue && <OverdueTag />}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Order value" value={formatINR(order.totalAmount)} />
        {showPayments && <Stat label="Received" value={formatINR(order.amountPaid!)} />}
        {showPayments && (
          <Stat label={order.isOverdue ? "Balance overdue" : "Balance due"} value={formatINR(order.balanceDue!)} tone={order.isOverdue ? "alert" : undefined} />
        )}
        <Stat label="Payment due" value={formatDateOnly(order.dueDate)} />
      </section>

      {editing ? (
        <EditOrder
          order={order}
          onDone={() => {
            setEditing(false);
            reload();
          }}
        />
      ) : (
        <section className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-neutral-500">Product: </span>
            {order.product.name} × {order.quantity} {order.product.unit}
          </div>
          <div>
            <span className="text-neutral-500">Ordered: </span>
            {formatDateOnly(order.orderDate)}
          </div>
          <div>
            <span className="text-neutral-500">Salesperson: </span>
            {order.salesperson.fullName}
          </div>
          <div>
            <span className="text-neutral-500">Lead: </span>
            <Link href={`/leads/${order.lead.id}`} className="underline">
              {order.customerName}
            </Link>{" "}
            · {order.lead.phone}
          </div>
          {order.deliveredAt && (
            <div>
              <span className="text-neutral-500">Delivered: </span>
              {formatDateTime(order.deliveredAt)}
            </div>
          )}
          {order.notes && (
            <div className="sm:col-span-2">
              <span className="text-neutral-500">Notes: </span>
              {order.notes}
            </div>
          )}
        </section>
      )}

      {!editing && order.status !== "CANCELLED" && (
        <section className="flex flex-wrap gap-2">
          {can(TAGS.SALES_WRITE) && (
            <button className={secondaryButtonClass} onClick={() => setEditing(true)}>
              Edit order
            </button>
          )}
          {confirmed && can(TAGS.STOCK_WRITE) && (
            <button className={buttonClass} disabled={action.busy} onClick={deliver}>
              Mark delivered (reduces stock)
            </button>
          )}
          {confirmed && can(TAGS.SALES_WRITE) && (
            <button className={secondaryButtonClass} disabled={action.busy} onClick={cancelOrder}>
              Cancel order
            </button>
          )}
        </section>
      )}
      <ErrorText error={action.error} />

      {showPayments && (
        <section className="space-y-3">
          <h2 className="font-medium">Payments received</h2>
          {order.payments!.length === 0 ? (
            <p className="text-sm text-neutral-500">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
              {order.payments!.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">{formatINR(p.amount)}</span>
                  <span>
                    {formatDateOnly(p.paidOn)} · {PAYMENT_MODE_LABELS[p.mode]}
                    {p.reference && ` · ${p.reference}`}
                  </span>
                  <span className="text-neutral-500">by {p.recordedBy.fullName}</span>
                  {can(TAGS.PAYMENTS_WRITE) && (
                    <button className="text-xs text-neutral-500 underline" onClick={() => removePayment(p.id)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {can(TAGS.PAYMENTS_WRITE) && order.status !== "CANCELLED" && balance > 0 && (
            <RecordPayment order={order} onDone={reload} />
          )}
        </section>
      )}
    </div>
  );
}
