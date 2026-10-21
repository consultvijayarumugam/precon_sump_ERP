"use client";

import { FormEvent, useState } from "react";
import { buttonClass, ErrorText, Field, inputClass, secondaryButtonClass } from "@/components/ui";
import { dayKey } from "@/lib/crm";
import { Installation, Person } from "@/lib/service";
import { useAction, useApi } from "@/lib/use-api";

interface EligibleOrder {
  id: string;
  orderNumberLabel: string;
  customerName: string;
  status: string;
  quantity: number;
  product: { name: string; unit: string };
  lead: { city: string | null; phone: string };
}

export interface InstallationFormValues {
  salesOrderId?: string;
  scheduledDate: string;
  assignedToId: string | null;
  teamName: string;
  siteAddress: string;
  notes: string;
}

interface Props {
  /** Editing an existing installation (the order can't change). */
  initial?: Installation;
  submitLabel: string;
  onSubmit: (values: InstallationFormValues) => Promise<void>;
  onCancel: () => void;
}

/** Schedule (pick an order) or reschedule an installation. */
export function InstallationForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const orders = useApi<EligibleOrder[]>(initial ? null : "/installations/eligible-orders");
  const people = useApi<Person[]>("/installations/assignees");
  const [salesOrderId, setSalesOrderId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(initial?.scheduledDate ?? dayKey(new Date()));
  const [assignedToId, setAssignedToId] = useState(initial?.assignedTo?.id ?? "");
  const [teamName, setTeamName] = useState(initial?.teamName ?? "");
  const [siteAddress, setSiteAddress] = useState(initial?.siteAddress ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const { run, busy, error } = useAction();

  function pickOrder(id: string) {
    setSalesOrderId(id);
    const order = orders.data?.find((o) => o.id === id);
    // Start the address with the lead's city so it's quicker to fill in.
    if (order && !siteAddress) setSiteAddress(order.lead.city ? `${order.customerName}, ${order.lead.city}` : order.customerName);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await run(() =>
      onSubmit({
        ...(initial ? {} : { salesOrderId }),
        scheduledDate,
        assignedToId: assignedToId || null,
        teamName,
        siteAddress,
        notes,
      }),
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="grid gap-3 sm:grid-cols-2">
        {!initial && (
          <div className="sm:col-span-2">
            <Field label="Sales order *">
              <select className={inputClass} required value={salesOrderId} onChange={(e) => pickOrder(e.target.value)}>
                <option value="">Choose an order…</option>
                {orders.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumberLabel} · {o.customerName} · {o.product.name} × {o.quantity} {o.product.unit}
                    {o.status === "CONFIRMED" ? " (not delivered yet)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            {orders.data?.length === 0 && (
              <p className="mt-1 text-xs text-neutral-500">Every active order already has an installation.</p>
            )}
          </div>
        )}
        <Field label="Installation date *">
          <input className={inputClass} type="date" required value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </Field>
        <Field label="Person in charge">
          <select className={inputClass} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">Not assigned</option>
            {people.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.role.name})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Team / crew">
          <input className={inputClass} placeholder="e.g. Crew A" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
        </Field>
        <Field label="Site address *">
          <input className={inputClass} required minLength={5} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={inputClass} rows={2} placeholder="Access, crane needed, contact on site…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText error={error ?? orders.error ?? people.error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          {submitLabel}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
