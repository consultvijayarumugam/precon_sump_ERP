"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { FollowUpItem } from "@/components/follow-up-item";
import { ConvertToOrder } from "@/components/convert-to-order";
import { LeadForm } from "@/components/lead-form";
import {
  buttonClass,
  ErrorText,
  inputClass,
  NoAccess,
  secondaryButtonCompactClass,
  StatusBadge,
} from "@/components/ui";
import { apiPatch, apiPost } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  LEAD_STATUSES,
  LeadDetail,
  LeadStatus,
  PRODUCT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  TAGS,
  toDateTimeLocal,
} from "@/lib/crm";
import { useApi } from "@/lib/use-api";

function AddFollowUp({ leadId, onAdded }: { leadId: string; onAdded: () => void }) {
  // Default: tomorrow at 11:00.
  const [scheduledAt, setScheduledAt] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    return toDateTimeLocal(tomorrow);
  });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/leads/${leadId}/follow-ups`, {
        scheduledAt: new Date(scheduledAt).toISOString(),
        note: note || undefined,
      });
      setNote("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add follow-up");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-neutral-200 bg-white shadow-xs p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <input
          type="datetime-local"
          required
          className={inputClass}
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
        <input className={inputClass} placeholder="What's the follow-up about?" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="submit" className={buttonClass} disabled={saving}>
          Schedule
        </button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const { data: lead, error, reload } = useApi<LeadDetail>(can(TAGS.LEADS_READ) ? `/leads/${id}` : null);
  const [editing, setEditing] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  if (!can(TAGS.LEADS_READ)) return <NoAccess tag={TAGS.LEADS_READ} />;
  if (error) return <ErrorText error={error} />;
  if (!lead) return <p className="text-sm text-neutral-500">Loading…</p>;

  const canWrite = can(TAGS.LEADS_WRITE);

  async function changeStatus(status: LeadStatus) {
    setStatusError(null);
    try {
      await apiPatch(`/leads/${id}`, { status });
      reload();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Could not change status");
    }
  }

  const pending = lead.followUps.filter((f) => !f.completedAt).reverse(); // soonest first
  const done = lead.followUps.filter((f) => f.completedAt);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/leads" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
          ← Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
          <StatusBadge status={lead.status} />
          {canWrite && !editing && (
            <button className={secondaryButtonCompactClass} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <LeadForm
          initial={lead}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const result = await apiPatch<LeadDetail | { movedOutOfScope: true }>(`/leads/${id}`, values);
            if ("movedOutOfScope" in result) {
              router.push("/leads"); // reassigned away; we can no longer see it
              return;
            }
            setEditing(false);
            reload();
          }}
        />
      ) : (
        <section className="grid gap-x-8 gap-y-2.5 rounded-lg border border-neutral-200 bg-white p-5 text-sm shadow-xs sm:grid-cols-2 dark:border-neutral-800 dark:bg-neutral-900">
          <Detail label="Phone">
            <a href={`tel:${lead.phone}`} className="text-brand-700 hover:underline dark:text-brand-300">
              {lead.phone}
            </a>
          </Detail>
          <Detail label="Email">{lead.email ?? "-"}</Detail>
          <Detail label="City">{lead.city ?? "-"}</Detail>
          <Detail label="Product interest">{PRODUCT_LABELS[lead.productInterest]}</Detail>
          <Detail label="Source">{SOURCE_LABELS[lead.source]}</Detail>
          <Detail label="Salesperson">{lead.assignedTo?.fullName ?? "Unassigned"}</Detail>
          <Detail label="Created">
            {formatDate(lead.createdAt)} by {lead.createdBy.fullName}
          </Detail>
          {lead.closedAt && (
            <Detail label={lead.status === "WON" ? "Won on" : "Closed on"}>{formatDateTime(lead.closedAt)}</Detail>
          )}
          <div className="sm:col-span-2">
            <Detail label="Notes">
              <span className="whitespace-pre-wrap">{lead.notes ?? "-"}</span>
            </Detail>
          </div>
        </section>
      )}

      {lead.salesOrder && can(TAGS.SALES_READ) && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950/40">
          Converted to sales order{" "}
          <Link href={`/orders/${lead.salesOrder.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            SO-{String(lead.salesOrder.orderNumber).padStart(4, "0")}
          </Link>
          {lead.salesOrder.status === "CANCELLED" ? " (cancelled)." : "."}
        </p>
      )}
      {lead.status === "WON" &&
        !lead.salesOrder &&
        can(TAGS.SALES_WRITE) &&
        !editing && <ConvertToOrder lead={lead} />}

      {canWrite && !editing && (
        <section>
          <h2 className="mb-2 font-medium">Move in pipeline</h2>
          <div className="flex flex-wrap gap-2">
            {LEAD_STATUSES.map((s) => (
              <button
                key={s}
                disabled={s === lead.status}
                onClick={() => changeStatus(s)}
                className={`${secondaryButtonCompactClass} ${s === lead.status ? "bg-neutral-200 dark:bg-neutral-800" : ""}`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <ErrorText error={statusError} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">Follow-ups</h2>
        {can(TAGS.FOLLOWUPS_WRITE) && <AddFollowUp leadId={lead.id} onAdded={reload} />}
        {lead.followUps.length === 0 && <p className="text-sm text-neutral-500">No follow-ups yet.</p>}
        {pending.length > 0 && (
          <ul className="space-y-2">
            {pending.map((f) => (
              <FollowUpItem key={f.id} followUp={f} onChange={reload} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <>
            <h3 className="pt-2 text-sm text-neutral-500">History</h3>
            <ul className="space-y-2">
              {done.map((f) => (
                <FollowUpItem key={f.id} followUp={f} onChange={reload} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-neutral-500">{label}: </span>
      {children}
    </div>
  );
}
