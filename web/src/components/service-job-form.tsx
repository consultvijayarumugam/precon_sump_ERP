"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { buttonClass, ErrorText, Field, inputClass, secondaryButtonClass } from "@/components/ui";
import { apiPost } from "@/lib/api";
import {
  JOB_PRIORITIES,
  JOB_PRIORITY_LABELS,
  JOB_TYPE_LABELS,
  JOB_TYPES,
  JobPriority,
  JobType,
  Person,
  ServiceJob,
} from "@/lib/service";
import { useAction, useApi } from "@/lib/use-api";

interface EligibleInstallation {
  id: string;
  customerName: string;
  product: string;
  orderNumberLabel: string;
  siteAddress: string;
}

/** Raise a service job (#4). Pass installationId to fix the customer. */
export function ServiceJobForm({ installationId, onCancel }: { installationId?: string; onCancel: () => void }) {
  const router = useRouter();
  const eligible = useApi<EligibleInstallation[]>(installationId ? null : "/service-jobs/eligible-installations");
  const people = useApi<Person[]>("/service-jobs/assignees");
  const [chosenInstallation, setChosenInstallation] = useState(installationId ?? "");
  const [type, setType] = useState<JobType>("COMPLAINT");
  const [priority, setPriority] = useState<JobPriority>("MEDIUM");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let id = "";
    const ok = await run(async () => {
      const job = await apiPost<ServiceJob>("/service-jobs", {
        installationId: chosenInstallation,
        type,
        priority,
        description,
        assignedToId: assignedToId || null,
      });
      id = job.id;
    });
    if (ok) router.push(`/service/${id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-white shadow-xs p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-medium">New service job</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {!installationId && (
          <div className="sm:col-span-2">
            <Field label="Customer (completed installation) *">
              <select className={inputClass} required value={chosenInstallation} onChange={(e) => setChosenInstallation(e.target.value)}>
                <option value="">Choose…</option>
                {eligible.data?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.customerName} · {i.product} · {i.orderNumberLabel}
                  </option>
                ))}
              </select>
            </Field>
            {eligible.data?.length === 0 && (
              <p className="mt-1 text-xs text-neutral-500">No completed installations you can raise jobs for yet.</p>
            )}
          </div>
        )}
        <Field label="Type *">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as JobType)}>
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>
                {JOB_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as JobPriority)}>
            {JOB_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {JOB_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assign to">
          <select className={inputClass} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">Not assigned</option>
            {people.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.role.name})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description *">
        <textarea
          className={inputClass}
          rows={3}
          required
          minLength={5}
          placeholder="What's wrong / what needs doing?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <ErrorText error={error ?? eligible.error ?? people.error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          Raise job
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
