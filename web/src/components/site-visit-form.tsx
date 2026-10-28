"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { buttonClass, ErrorText, Field, inputClass, secondaryButtonClass, TagChip } from "@/components/ui";
import { dayKey } from "@/lib/crm";
import { Installation, Person, SiteVisit, SiteVisitTag } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

export interface SiteVisitValues {
  visitDate: string;
  personId: string;
  customerName: string;
  siteAddress: string;
  purpose: string;
  notes: string;
  installationId: string | null;
  tagIds: string[];
}

interface Props {
  initial?: SiteVisit;
  submitLabel: string;
  onSubmit: (values: SiteVisitValues) => Promise<void>;
  onCancel: () => void;
}

/** Record or edit a site visit (#18) and choose its tags. */
export function SiteVisitForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const { user, can, operations } = useAuth();
  const tags = useApi<SiteVisitTag[]>("/site-visit-tags");
  const people = useApi<Person[]>("/site-visits/people");
  // Linking to an installation needs installations.read to list them.
  const installations = useApi<Installation[]>(can(TAGS.INSTALLATIONS_READ) && operations ? "/installations" : null);

  const [visitDate, setVisitDate] = useState(initial?.visitDate ?? dayKey(new Date()));
  const [personId, setPersonId] = useState(initial?.person.id ?? user.id);
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [siteAddress, setSiteAddress] = useState(initial?.siteAddress ?? "");
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [installationId, setInstallationId] = useState(initial?.installation?.id ?? "");
  const [tagIds, setTagIds] = useState<string[]>(initial?.tags.map((t) => t.id) ?? []);
  const { run, busy, error } = useAction();

  // Active tags, plus any retired ones this visit already has.
  const retiredOnVisit = (initial?.tags ?? []).filter((t) => !t.isActive);
  const pickable = [...(tags.data ?? []), ...retiredOnVisit.filter((r) => !tags.data?.some((t) => t.id === r.id))];
  const toggle = (id: string) => setTagIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  function pickInstallation(id: string) {
    setInstallationId(id);
    const inst = installations.data?.find((i) => i.id === id);
    if (inst) {
      if (!customerName) setCustomerName(inst.salesOrder.customerName);
      if (!siteAddress) setSiteAddress(inst.siteAddress);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await run(() =>
      onSubmit({ visitDate, personId, customerName, siteAddress, purpose, notes, installationId: installationId || null, tagIds }),
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-white shadow-xs p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Visit date *">
          <input className={inputClass} type="date" required value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
        </Field>
        <Field label="Visited by *">
          <select className={inputClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
            {people.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.role.name})
              </option>
            ))}
          </select>
        </Field>
        {installations.data && (
          <div className="sm:col-span-2">
            <Field label="About an installation (optional)">
              <select className={inputClass} value={installationId} onChange={(e) => pickInstallation(e.target.value)}>
                <option value="">Not linked</option>
                {installations.data.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.salesOrder.customerName} · {i.salesOrder.orderNumberLabel} · {i.status.toLowerCase().replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Customer / site name *">
          <input className={inputClass} required minLength={2} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </Field>
        <Field label="Site address *">
          <input className={inputClass} required minLength={5} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
        </Field>
      </div>
      <Field label="Purpose *">
        <input
          className={inputClass}
          required
          minLength={3}
          placeholder="e.g. Measure pit for a 10,000 L sump"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </Field>
      <div className="text-sm">
        <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Tags</span>
        <div className="flex flex-wrap gap-2">
          {pickable.map((t) => (
            <TagChip key={t.id} tag={t} selected={tagIds.includes(t.id)} onClick={() => toggle(t.id)} />
          ))}
          {tags.data?.length === 0 && <span className="text-xs text-neutral-500">No tags defined yet.</span>}
        </div>
      </div>
      <Field label="Notes">
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText error={error ?? tags.error ?? people.error} />
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
