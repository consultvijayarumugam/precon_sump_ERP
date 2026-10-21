"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  overdueRowClass,
  OverdueTag,
  Stat,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { api, apiPost } from "@/lib/api";
import { dayKey } from "@/lib/crm";
import {
  addDaysToDate,
  formatDateOnly,
  formatINR,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  PaymentMode,
  VENDOR_CATEGORY_LABELS,
  VendorDetail,
} from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

function AddPurchase({ vendorId, onDone }: { vendorId: string; onDone: () => void }) {
  const [item, setItem] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => dayKey(new Date()));
  const [dueDate, setDueDate] = useState(() => addDaysToDate(dayKey(new Date()), 30));
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      apiPost(`/vendors/${vendorId}/purchases`, {
        item,
        invoiceNumber: invoiceNumber || undefined,
        amount: Number(amount),
        purchaseDate,
        dueDate,
      }),
    );
    if (ok) {
      setItem("");
      setInvoiceNumber("");
      setAmount("");
      onDone();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-white shadow-xs p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="text-sm font-medium">Record a purchase (bill)</h3>
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-2">
          <Field label="Item *">
            <input className={inputClass} required minLength={2} placeholder="e.g. OPC 53 cement, 100 bags" value={item} onChange={(e) => setItem(e.target.value)} />
          </Field>
        </div>
        <Field label="Amount (₹) *">
          <input className={inputClass} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Bill date *">
          <input className={inputClass} type="date" required value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Field>
        <Field label="Pay by *">
          <input className={inputClass} type="date" required min={purchaseDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Invoice no.">
          <input className={inputClass} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </Field>
      </div>
      <ErrorText error={error} />
      <button type="submit" className={buttonClass} disabled={busy}>
        Save purchase
      </button>
    </form>
  );
}

function AddVendorPayment({ vendor, onDone }: { vendor: VendorDetail; onDone: () => void }) {
  const [amount, setAmount] = useState(vendor.outstanding);
  const [paidOn, setPaidOn] = useState(() => dayKey(new Date()));
  const [mode, setMode] = useState<PaymentMode>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      apiPost(`/vendors/${vendor.id}/payments`, { amount: Number(amount), paidOn, mode, reference: reference || undefined }),
    );
    if (ok) {
      setReference("");
      onDone();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-white shadow-xs p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="text-sm font-medium">Record a payment to this vendor</h3>
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
        <Field label="Reference">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-neutral-500">Payments are applied to the oldest unpaid bills first.</p>
      <ErrorText error={error} />
      <button type="submit" className={buttonClass} disabled={busy}>
        Save payment
      </button>
    </form>
  );
}

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data: vendor, error, reload } = useApi<VendorDetail>(can(TAGS.VENDORS_READ) ? `/vendors/${id}` : null);
  const action = useAction();

  if (!can(TAGS.VENDORS_READ)) return <NoAccess tag={TAGS.VENDORS_READ} />;
  if (error) return <ErrorText error={error} />;
  if (!vendor) return <p className="text-sm text-neutral-500">Loading…</p>;

  const canWrite = can(TAGS.VENDORS_WRITE);
  async function removePayment(paymentId: string) {
    if (!confirm("Remove this payment?")) return;
    if (await action.run(() => api(`/vendor-payments/${paymentId}`, { method: "DELETE" }))) reload();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/vendors" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
          ← Vendors
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{vendor.name}</h1>
        <p className="text-sm text-neutral-500">
          {VENDOR_CATEGORY_LABELS[vendor.category]}
          {vendor.contactPerson && ` · ${vendor.contactPerson}`}
          {vendor.phone && (
            <>
              {" · "}
              <a href={`tel:${vendor.phone}`} className="text-brand-700 hover:underline dark:text-brand-300">
                {vendor.phone}
              </a>
            </>
          )}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Purchased" value={formatINR(vendor.totalPurchased)} />
        <Stat label="Paid" value={formatINR(vendor.totalPaid)} />
        <Stat label="Outstanding" value={formatINR(vendor.outstanding)} />
        <Stat label="Overdue" value={formatINR(vendor.overdue)} tone={Number(vendor.overdue) > 0 ? "alert" : undefined} />
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Purchases</h2>
        {vendor.purchases.length === 0 ? (
          <p className="text-sm text-neutral-500">No purchases yet.</p>
        ) : (
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Item</th>
                  <th className={thClass}>Bill date</th>
                  <th className={thClass}>Pay by</th>
                  <th className={`${thClass} text-right`}>Amount</th>
                  <th className={`${thClass} text-right`}>Unpaid</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {vendor.purchases.map((p) => (
                  <tr key={p.id} className={p.isOverdue ? overdueRowClass : ""}>
                    <td className={tdClass}>
                      {p.item}
                      {p.invoiceNumber && <div className="text-xs text-neutral-500">Invoice {p.invoiceNumber}</div>}
                    </td>
                    <td className={tdClass}>{formatDateOnly(p.purchaseDate)}</td>
                    <td className={tdClass}>
                      {formatDateOnly(p.dueDate)}
                      {p.isOverdue && (
                        <div>
                          <OverdueTag days={p.daysOverdue} />
                        </div>
                      )}
                    </td>
                    <td className={`${tdClass} text-right`}>{formatINR(p.amount)}</td>
                    <td className={`${tdClass} text-right font-medium`}>
                      {Number(p.unpaid) > 0 ? formatINR(p.unpaid) : <span className="text-green-700">Paid</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canWrite && <AddPurchase vendorId={vendor.id} onDone={reload} />}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Payments made</h2>
        {vendor.payments.length === 0 ? (
          <p className="text-sm text-neutral-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white px-4 text-sm shadow-xs dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
            {vendor.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{formatINR(p.amount)}</span>
                <span>
                  {formatDateOnly(p.paidOn)} · {PAYMENT_MODE_LABELS[p.mode]}
                  {p.reference && ` · ${p.reference}`}
                </span>
                <span className="text-neutral-500">by {p.recordedBy.fullName}</span>
                {canWrite && (
                  <button className="text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:underline dark:hover:text-neutral-200" onClick={() => removePayment(p.id)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <ErrorText error={action.error} />
        {canWrite && Number(vendor.outstanding) > 0 && <AddVendorPayment key={vendor.outstanding} vendor={vendor} onDone={reload} />}
      </section>
    </div>
  );
}
