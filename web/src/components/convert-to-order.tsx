"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { buttonClass, ErrorText, Field, inputClass, secondaryButtonClass } from "@/components/ui";
import { apiPost } from "@/lib/api";
import { dayKey, Lead, PRODUCT_INTERESTS, PRODUCT_LABELS, ProductInterest } from "@/lib/crm";
import { addDaysToDate, SalesOrder } from "@/lib/finance";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

interface Assignee {
  id: string;
  fullName: string;
}

/** Shown on a WON lead with no order yet: turns it into a sales order (#7). */
export function ConvertToOrder({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { can } = useAuth();
  const canCreditOthers = can(TAGS.SALES_READ_ALL) && can(TAGS.LEADS_ASSIGN);
  const assignees = useApi<Assignee[]>(canCreditOthers ? "/leads/assignees" : null);

  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<ProductInterest>(lead.productInterest);
  const [quantity, setQuantity] = useState("1");
  const [totalAmount, setTotalAmount] = useState("");
  const [orderDate, setOrderDate] = useState(() => dayKey(new Date()));
  const [dueDate, setDueDate] = useState(() => addDaysToDate(dayKey(new Date()), 30));
  const [salespersonId, setSalespersonId] = useState(lead.assignedTo?.id ?? "");
  const [notes, setNotes] = useState("");
  const { run, busy, error } = useAction();

  if (!open) {
    return (
      <div className="rounded border border-green-300 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950/40">
        This lead is won.{" "}
        <button className={`${buttonClass} ml-2 py-1`} onClick={() => setOpen(true)}>
          Convert to sales order
        </button>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let created: SalesOrder | null = null;
    const ok = await run(async () => {
      created = await apiPost<SalesOrder>("/sales-orders", {
        leadId: lead.id,
        product,
        quantity: Number(quantity),
        totalAmount: Number(totalAmount),
        orderDate,
        dueDate,
        notes: notes || undefined,
        ...(canCreditOthers && salespersonId ? { salespersonId } : {}),
      });
    });
    if (ok && created) router.push(`/orders/${(created as SalesOrder).id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-green-300 p-4 dark:border-green-900">
      <h2 className="font-medium">Convert to sales order</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Product">
          <select className={inputClass} value={product} onChange={(e) => setProduct(e.target.value as ProductInterest)}>
            {PRODUCT_INTERESTS.map((p) => (
              <option key={p} value={p}>
                {PRODUCT_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity">
          <input className={inputClass} type="number" min="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Total amount (₹)">
          <input
            className={inputClass}
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="e.g. 65000"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
          />
        </Field>
        <Field label="Order date">
          <input
            className={inputClass}
            type="date"
            required
            value={orderDate}
            onChange={(e) => {
              setOrderDate(e.target.value);
              setDueDate(addDaysToDate(e.target.value, 30));
            }}
          />
        </Field>
        <Field label="Payment due">
          <input className={inputClass} type="date" required value={dueDate} min={orderDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        {canCreditOthers ? (
          <Field label="Salesperson (revenue credit)">
            <select className={inputClass} required value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}>
              <option value="">Choose…</option>
              {assignees.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Salesperson (revenue credit)">
            <input className={inputClass} disabled value={lead.assignedTo?.fullName ?? "-"} />
          </Field>
        )}
      </div>
      <Field label="Notes">
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          Create order
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
