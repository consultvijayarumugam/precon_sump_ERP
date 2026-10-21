"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { buttonClass, ErrorText, inputClass, secondaryButtonClass } from "@/components/ui";
import {
  Lead,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LeadSource,
  LeadStatus,
  PRODUCT_INTERESTS,
  PRODUCT_LABELS,
  ProductInterest,
  SOURCE_LABELS,
  STATUS_LABELS,
  TAGS,
} from "@/lib/crm";
import { useApi } from "@/lib/use-api";

export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  city: string;
  source: LeadSource;
  productInterest: ProductInterest;
  status: LeadStatus;
  notes: string;
  assignedToId: string;
}

/** What the form submits: assignedToId is null for "unassigned", absent if the user can't assign. */
export type LeadSubmitValues = Omit<LeadFormValues, "assignedToId"> & { assignedToId?: string | null };

interface Props {
  initial?: Lead;
  submitLabel: string;
  onSubmit: (values: LeadSubmitValues) => Promise<void>;
  onCancel?: () => void;
}

interface Assignee {
  id: string;
  fullName: string;
  role: { name: string };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

/** Create/edit form. The salesperson picker only appears with leads.assign. */
export function LeadForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const { can } = useAuth();
  const canAssign = can(TAGS.LEADS_ASSIGN);
  const assignees = useApi<Assignee[]>(canAssign ? "/leads/assignees" : null);

  const [values, setValues] = useState<LeadFormValues>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    city: initial?.city ?? "",
    source: initial?.source ?? "MANUAL",
    productInterest: initial?.productInterest ?? "UG_SUMP",
    status: initial?.status ?? "NEW",
    notes: initial?.notes ?? "",
    assignedToId: initial?.assignedTo?.id ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { assignedToId, ...rest } = values;
      await onSubmit({
        ...rest,
        // Only send assignment if the user may assign; "" means unassigned.
        ...(canAssign ? { assignedToId: assignedToId || null } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *">
          <input className={inputClass} required minLength={2} value={values.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Phone *">
          <input
            className={inputClass}
            required
            type="tel"
            placeholder="98765 43210"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="City">
          <input className={inputClass} value={values.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="Source *">
          <select className={inputClass} value={values.source} onChange={(e) => set("source", e.target.value as LeadSource)}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product interest *">
          <select
            className={inputClass}
            value={values.productInterest}
            onChange={(e) => set("productInterest", e.target.value as ProductInterest)}
          >
            {PRODUCT_INTERESTS.map((p) => (
              <option key={p} value={p}>
                {PRODUCT_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={values.status} onChange={(e) => set("status", e.target.value as LeadStatus)}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        {canAssign && (
          <Field label="Assigned salesperson">
            <select className={inputClass} value={values.assignedToId} onChange={(e) => set("assignedToId", e.target.value)}>
              <option value="">Unassigned</option>
              {assignees.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName} ({a.role.name})
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="Notes">
        <textarea className={inputClass} rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <ErrorText error={error ?? assignees.error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={secondaryButtonClass} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
