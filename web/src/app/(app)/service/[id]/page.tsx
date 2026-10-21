"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ServiceFollowUpItem } from "@/components/follow-up-item";
import {
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  JobStatusBadge,
  NoAccess,
  PriorityBadge,
  secondaryButtonClass,
} from "@/components/ui";
import { apiPatch, apiPost } from "@/lib/api";
import { formatDate, formatDateTime, toDateTimeLocal } from "@/lib/crm";
import {
  JOB_PRIORITIES,
  JOB_PRIORITY_LABELS,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  JOB_TYPE_LABELS,
  JOB_TYPES,
  JobPriority,
  JobStatus,
  JobType,
  Person,
  ServiceJobDetail,
} from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

function EditJob({ job, onDone }: { job: ServiceJobDetail; onDone: (movedOut: boolean) => void }) {
  const people = useApi<Person[]>("/service-jobs/assignees");
  const [type, setType] = useState<JobType>(job.type);
  const [priority, setPriority] = useState<JobPriority>(job.priority);
  const [status, setStatus] = useState<JobStatus>(job.status);
  const [assignedToId, setAssignedToId] = useState(job.assignedTo?.id ?? "");
  const [description, setDescription] = useState(job.description);
  const [resolutionNotes, setResolutionNotes] = useState(job.resolutionNotes ?? "");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let movedOut = false;
    const ok = await run(async () => {
      const result = await apiPatch<{ movedOutOfScope?: boolean }>(`/service-jobs/${job.id}`, {
        type,
        priority,
        status,
        assignedToId: assignedToId || null,
        description,
        resolutionNotes: resolutionNotes || undefined,
      });
      movedOut = Boolean(result.movedOutOfScope);
    });
    if (ok) onDone(movedOut);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Status">
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
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
        <Field label="Assigned to">
          <select className={inputClass} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">Not assigned</option>
            {people.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea className={inputClass} rows={2} required minLength={5} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Resolution notes (what was done)">
        <textarea className={inputClass} rows={2} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} />
      </Field>
      <ErrorText error={error ?? people.error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          Save
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddServiceFollowUp({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const [scheduledAt, setScheduledAt] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    return toDateTimeLocal(tomorrow);
  });
  const [note, setNote] = useState("");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      apiPost(`/service-jobs/${jobId}/follow-ups`, { scheduledAt: new Date(scheduledAt).toISOString(), note: note || undefined }),
    );
    if (ok) {
      setNote("");
      onAdded();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <input type="datetime-local" required className={inputClass} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        <input className={inputClass} placeholder="e.g. Call to confirm the leak has stopped" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="submit" className={buttonClass} disabled={busy}>
          Schedule
        </button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

export default function ServiceJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const { data: job, error, reload } = useApi<ServiceJobDetail>(can(TAGS.SERVICE_READ) ? `/service-jobs/${id}` : null);
  const [editing, setEditing] = useState(false);

  if (!can(TAGS.SERVICE_READ)) return <NoAccess tag={TAGS.SERVICE_READ} />;
  if (error) return <ErrorText error={error} />;
  if (!job) return <p className="text-sm text-neutral-500">Loading…</p>;

  const canWrite = can(TAGS.SERVICE_WRITE);
  const pending = job.followUps.filter((f) => !f.completedAt).reverse();
  const done = job.followUps.filter((f) => f.completedAt);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/service" className="text-sm text-neutral-500 underline">
          ← Service jobs
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">
            {job.jobNumberLabel} · {job.customer.name}
          </h1>
          <JobStatusBadge status={job.status} />
          <PriorityBadge priority={job.priority} />
          {canWrite && !editing && (
            <button className={secondaryButtonClass + " py-1"} onClick={() => setEditing(true)}>
              Update
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <EditJob
          job={job}
          onDone={(movedOut) => {
            if (movedOut) router.push("/service");
            setEditing(false);
            reload();
          }}
        />
      ) : (
        <section className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="text-neutral-500">{JOB_TYPE_LABELS[job.type]}: </span>
            {job.description}
          </div>
          <div>
            <span className="text-neutral-500">Assigned to: </span>
            {job.assignedTo?.fullName ?? "Not assigned"}
          </div>
          <div>
            <span className="text-neutral-500">Raised: </span>
            {formatDate(job.createdAt)} by {job.createdBy.fullName}
          </div>
          <div>
            <span className="text-neutral-500">Phone: </span>
            <a href={`tel:${job.customer.phone}`} className="underline">
              {job.customer.phone}
            </a>
          </div>
          <div>
            <span className="text-neutral-500">Product: </span>
            {job.customer.product}
          </div>
          <div className="sm:col-span-2">
            <span className="text-neutral-500">Site: </span>
            {job.customer.siteAddress}
          </div>
          <div>
            <span className="text-neutral-500">Installation: </span>
            {can(TAGS.INSTALLATIONS_READ) ? (
              <Link href={`/installations/${job.installation.id}`} className="underline">
                completed {job.installation.completedAt ? formatDate(job.installation.completedAt) : ""}
              </Link>
            ) : (
              `completed ${job.installation.completedAt ? formatDate(job.installation.completedAt) : ""}`
            )}
          </div>
          <div>
            <span className="text-neutral-500">Sold by: </span>
            {job.customer.salesperson.fullName} ({job.salesOrder.orderNumberLabel})
          </div>
          {job.resolvedAt && (
            <div>
              <span className="text-neutral-500">Resolved: </span>
              {formatDateTime(job.resolvedAt)}
            </div>
          )}
          {job.resolutionNotes && (
            <div className="sm:col-span-2">
              <span className="text-neutral-500">Resolution: </span>
              {job.resolutionNotes}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">Service follow-ups</h2>
        {canWrite && <AddServiceFollowUp jobId={job.id} onAdded={reload} />}
        {job.followUps.length === 0 && <p className="text-sm text-neutral-500">No follow-ups yet.</p>}
        {pending.length > 0 && (
          <ul className="space-y-2">
            {pending.map((f) => (
              <ServiceFollowUpItem key={f.id} followUp={f} onChange={reload} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <>
            <h3 className="pt-2 text-sm text-neutral-500">History</h3>
            <ul className="space-y-2">
              {done.map((f) => (
                <ServiceFollowUpItem key={f.id} followUp={f} onChange={reload} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
