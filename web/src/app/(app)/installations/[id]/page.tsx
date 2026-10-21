"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { InstallationForm } from "@/components/installation-form";
import { ServiceJobForm } from "@/components/service-job-form";
import {
  buttonClass,
  ErrorText,
  Field,
  InstallationStatusBadge,
  inputClass,
  JobStatusBadge,
  NoAccess,
  OrderStatusBadge,
  OverdueTag,
  PriorityBadge,
  secondaryButtonClass,
} from "@/components/ui";
import { apiPatch, apiPost } from "@/lib/api";
import { formatDateTime } from "@/lib/crm";
import { formatDateOnly } from "@/lib/finance";
import { InstallationDetail, JOB_TYPE_LABELS } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

function CompleteForm({ inst, onDone, onCancel }: { inst: InstallationDetail; onDone: () => void; onCancel: () => void }) {
  const [completionNotes, setCompletionNotes] = useState("");
  const { run, busy, error } = useAction();
  const delivers = inst.salesOrder.status === "CONFIRMED";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => apiPost(`/installations/${inst.id}/complete`, { completionNotes: completionNotes || undefined }))) onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-green-300 p-4 dark:border-green-900">
      <h2 className="font-medium">Complete installation</h2>
      {delivers && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {inst.salesOrder.orderNumberLabel} isn&apos;t marked delivered yet. Completing will also mark it delivered and take{" "}
          {inst.salesOrder.quantity} {inst.salesOrder.product.unit} out of stock.
        </p>
      )}
      <Field label="Completion notes">
        <textarea
          className={inputClass}
          rows={2}
          placeholder="e.g. Placed, backfilled, water-tested; customer signed off"
          value={completionNotes}
          onChange={(e) => setCompletionNotes(e.target.value)}
        />
      </Field>
      <ErrorText error={error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          Mark completed
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function InstallationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data: inst, error, reload } = useApi<InstallationDetail>(can(TAGS.INSTALLATIONS_READ) ? `/installations/${id}` : null);
  const [mode, setMode] = useState<"view" | "edit" | "complete" | "raise">("view");
  const start = useAction();

  if (!can(TAGS.INSTALLATIONS_READ)) return <NoAccess tag={TAGS.INSTALLATIONS_READ} />;
  if (error) return <ErrorText error={error} />;
  if (!inst) return <p className="text-sm text-neutral-500">Loading…</p>;

  const canWrite = can(TAGS.INSTALLATIONS_WRITE);
  const completed = inst.status === "COMPLETED";
  const done = () => {
    setMode("view");
    reload();
  };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/installations" className="text-sm text-neutral-500 underline">
          ← Installations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Installation · {inst.salesOrder.customerName}</h1>
          <InstallationStatusBadge status={inst.status} />
          {inst.isLate && <OverdueTag />}
        </div>
      </div>

      {mode === "edit" ? (
        <InstallationForm
          initial={inst}
          submitLabel="Save"
          onCancel={() => setMode("view")}
          onSubmit={async (values) => {
            await apiPatch(`/installations/${id}`, values);
            done();
          }}
        />
      ) : (
        <section className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-neutral-500">Date: </span>
            {formatDateOnly(inst.scheduledDate)}
          </div>
          <div>
            <span className="text-neutral-500">Assigned: </span>
            {inst.assignedTo?.fullName ?? "Not assigned"}
            {inst.teamName && ` · ${inst.teamName}`}
          </div>
          <div className="sm:col-span-2">
            <span className="text-neutral-500">Site: </span>
            {inst.siteAddress}
          </div>
          <div>
            <span className="text-neutral-500">Order: </span>
            {can(TAGS.SALES_READ) ? (
              <Link href={`/orders/${inst.salesOrder.id}`} className="underline">
                {inst.salesOrder.orderNumberLabel}
              </Link>
            ) : (
              inst.salesOrder.orderNumberLabel
            )}{" "}
            <OrderStatusBadge status={inst.salesOrder.status} />
          </div>
          <div>
            <span className="text-neutral-500">Product: </span>
            {inst.salesOrder.product.name} × {inst.salesOrder.quantity} {inst.salesOrder.product.unit}
          </div>
          <div>
            <span className="text-neutral-500">Customer phone: </span>
            <a href={`tel:${inst.salesOrder.lead.phone}`} className="underline">
              {inst.salesOrder.lead.phone}
            </a>
          </div>
          <div>
            <span className="text-neutral-500">Salesperson: </span>
            {inst.salesOrder.salesperson.fullName}
          </div>
          {inst.startedAt && (
            <div>
              <span className="text-neutral-500">Started: </span>
              {formatDateTime(inst.startedAt)}
            </div>
          )}
          {inst.completedAt && (
            <div>
              <span className="text-neutral-500">Completed: </span>
              {formatDateTime(inst.completedAt)}
            </div>
          )}
          {inst.notes && (
            <div className="sm:col-span-2">
              <span className="text-neutral-500">Notes: </span>
              {inst.notes}
            </div>
          )}
          {inst.completionNotes && (
            <div className="sm:col-span-2">
              <span className="text-neutral-500">Completion notes: </span>
              {inst.completionNotes}
            </div>
          )}
        </section>
      )}

      {canWrite && !completed && mode === "view" && (
        <section className="flex flex-wrap gap-2">
          {inst.status === "SCHEDULED" && (
            <button
              className={secondaryButtonClass}
              disabled={start.busy}
              onClick={async () => {
                if (await start.run(() => apiPost(`/installations/${id}/start`))) reload();
              }}
            >
              Start (in progress)
            </button>
          )}
          <button className={buttonClass} onClick={() => setMode("complete")}>
            Complete…
          </button>
          <button className={secondaryButtonClass} onClick={() => setMode("edit")}>
            Reschedule / edit
          </button>
        </section>
      )}
      <ErrorText error={start.error} />
      {mode === "complete" && <CompleteForm inst={inst} onDone={done} onCancel={() => setMode("view")} />}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Service jobs</h2>
          {completed && can(TAGS.SERVICE_WRITE) && mode !== "raise" && (
            <button className={secondaryButtonClass + " py-1"} onClick={() => setMode("raise")}>
              Raise service job
            </button>
          )}
        </div>
        {!completed && (
          <p className="text-sm text-neutral-500">Service jobs can be raised once the installation is completed.</p>
        )}
        {mode === "raise" && <ServiceJobForm installationId={inst.id} onCancel={() => setMode("view")} />}
        {inst.serviceJobs.length > 0 && (
          <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
            {inst.serviceJobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-3 py-2">
                {can(TAGS.SERVICE_READ) ? (
                  <Link href={`/service/${j.id}`} className="font-medium underline">
                    {j.jobNumberLabel}
                  </Link>
                ) : (
                  <span className="font-medium">{j.jobNumberLabel}</span>
                )}
                <span>{JOB_TYPE_LABELS[j.type]}</span>
                <PriorityBadge priority={j.priority} />
                <JobStatusBadge status={j.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
