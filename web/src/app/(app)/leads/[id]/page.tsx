"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { FollowUpItem } from "@/components/follow-up-item";
import { ConvertToOrder } from "@/components/convert-to-order";
import { LeadForm } from "@/components/lead-form";
import { LeadHistoryTimeline, LeadOwners, LeadVisits } from "@/components/lead-handover";
import { LeadNotes } from "@/components/lead-notes";
import { LeadVoiceNotes } from "@/components/lead-voice-notes";
import { CallButton } from "@/components/call-button";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { groupedStages, moveEffect } from "@/lib/stage-sides";
import { useStages, type PipelineStage } from "@/lib/stages";
import { SharedFiles } from "@/components/shared-files";
import type { SharedFile } from "@/lib/files";
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
  LeadDetail,
  productInterestLabel,
  SOURCE_LABELS,
  TAGS,
  toDateTimeLocal,
} from "@/lib/crm";
import { useApi } from "@/lib/use-api";
import { CALL_OUTCOME_LABELS, CallOutcome, CheckIn, CLOSING_OUTCOMES, PHONE_DIRECTION_LABELS, phoneCallResult, type PhoneCallDirection } from "@/lib/workflow";
import { leadLabel } from "@/lib/phone";

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

interface CallLogRow {
  id: string;
  outcome: CallOutcome;
  note: string | null;
  calledAt: string;
  caller: { id: string; fullName: string };
}

interface CallAttemptRow {
  id: string;
  message: string;
  createdAt: string;
  user: { id: string; fullName: string };
}

interface MessageRow {
  id: string;
  templateName: string | null;
  message: string;
  attachments: SharedFile[] | null;
  createdAt: string;
  user: { id: string; fullName: string };
}

/** A real call read from the phone's call log by the mobile app (any direction, with its duration). */
interface PhoneCallRow {
  id: string;
  direction: PhoneCallDirection;
  startedAt: string;
  durationSeconds: number;
  user: { id: string; fullName: string };
}

type HistoryEntry =
  | { kind: "call"; id: string; at: string; by: string; call: CallLogRow }
  | { kind: "phone"; id: string; at: string; by: string; phone: PhoneCallRow }
  | { kind: "attempt"; id: string; at: string; by: string }
  | { kind: "whatsapp"; id: string; at: string; by: string; msg: MessageRow }
  | { kind: "visit"; id: string; at: string; by: string; visit: CheckIn };

/** Calls logged and WhatsApp messages started on the lead, newest first. */
function ContactHistory({ leadId, refreshKey }: { leadId: string; refreshKey: string }) {
  const calls = useApi<CallLogRow[]>(`/leads/${leadId}/calls?r=${refreshKey}`);
  const attempts = useApi<CallAttemptRow[]>(`/leads/${leadId}/call-attempts?r=${refreshKey}`);
  const messages = useApi<MessageRow[]>(`/leads/${leadId}/messages?r=${refreshKey}`);
  const visits = useApi<CheckIn[]>(`/leads/${leadId}/visits?r=${refreshKey}`);
  const phoneCalls = useApi<PhoneCallRow[]>(`/leads/${leadId}/device-calls?r=${refreshKey}`);
  const entries: HistoryEntry[] | null =
    calls.data && attempts.data && messages.data && visits.data && phoneCalls.data
      ? [
          ...phoneCalls.data.map((p) => ({ kind: "phone" as const, id: p.id, at: p.startedAt, by: p.user.fullName, phone: p })),
          ...calls.data.map((c) => ({ kind: "call" as const, id: c.id, at: c.calledAt, by: c.caller.fullName, call: c })),
          ...attempts.data.map((a) => ({ kind: "attempt" as const, id: a.id, at: a.createdAt, by: a.user.fullName })),
          ...messages.data.map((m) => ({ kind: "whatsapp" as const, id: m.id, at: m.createdAt, by: m.user.fullName, msg: m })),
          ...visits.data.map((v) => ({ kind: "visit" as const, id: v.id, at: v.checkedInAt, by: v.person.fullName, visit: v })),
        ].sort((a, b) => b.at.localeCompare(a.at))
      : null;
  return (
    <section className="space-y-3">
      <h2 className="font-medium">
        Calls, messages &amp; visits{entries && entries.length > 0 && <span className="ml-1 text-neutral-500">· {entries.length}</span>}
      </h2>
      <ErrorText error={calls.error ?? attempts.error ?? messages.error ?? visits.error ?? phoneCalls.error} />
      {entries && entries.length === 0 && <p className="text-sm text-neutral-500">No calls or messages yet.</p>}
      {entries && entries.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white text-sm shadow-xs dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
              {e.kind === "call" ? (
                <span>
                  <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">Call</span>
                  <span
                    className={`font-semibold ${
                      CLOSING_OUTCOMES.includes(e.call.outcome)
                        ? "text-red-700 dark:text-red-300"
                        : e.call.outcome === "INTERESTED"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : ""
                    }`}
                  >
                    {CALL_OUTCOME_LABELS[e.call.outcome]}
                  </span>
                  {e.call.note && <span className="text-neutral-600 dark:text-neutral-400"> · {e.call.note}</span>}
                </span>
              ) : e.kind === "phone" ? (
                <span>
                  <span className={`mr-1.5 text-xs font-semibold uppercase tracking-wider ${e.phone.direction === "INCOMING" ? "text-emerald-600" : "text-[var(--ps-blue-600)]"}`}>
                    {PHONE_DIRECTION_LABELS[e.phone.direction]}
                  </span>
                  <span className="font-semibold">{phoneCallResult(e.phone)}</span>
                  <span className="text-neutral-600 dark:text-neutral-400"> · from the phone&apos;s call log</span>
                </span>
              ) : e.kind === "attempt" ? (
                <span>
                  <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--ps-blue-600)]">Call started</span>
                  <span className="text-neutral-600 dark:text-neutral-400">Dialer opened</span>
                </span>
              ) : e.kind === "visit" ? (
                <span className="min-w-0 flex-1">
                  <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-orange-600">Site visit</span>
                  <span className="font-semibold">GPS check-in</span>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {" "}
                    · {e.visit.latitude.toFixed(5)}, {e.visit.longitude.toFixed(5)}
                    {e.visit.notes && ` · ${e.visit.notes}`}
                  </span>
                </span>
              ) : (
                <span className="min-w-0 flex-1">
                  <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">WhatsApp</span>
                  <span className="font-semibold">{e.msg.templateName ?? "Chat opened"}</span>
                  {e.msg.message && <span className="mt-0.5 block whitespace-pre-line break-words text-neutral-600 dark:text-neutral-400">{e.msg.message}</span>}
                  <SharedFiles files={e.msg.attachments} />
                </span>
              )}
              <span className="text-xs text-neutral-500">
                {formatDateTime(e.at)} · {e.by}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, operations, user } = useAuth();
  const { data: lead, error, reload } = useApi<LeadDetail>(can(TAGS.LEADS_READ) ? `/leads/${id}` : null);
  const stages = useStages(can(TAGS.LEADS_READ));
  const [editing, setEditing] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  // Set when a move took the lead out of this person's list (e.g. sent back to the telecaller).
  const [movedAway, setMovedAway] = useState<string | null>(null);

  if (!can(TAGS.LEADS_READ)) return <NoAccess tag={TAGS.LEADS_READ} />;
  if (movedAway) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
          {movedAway}
        </p>
        <Link href="/leads" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
          ← Back to leads
        </Link>
      </div>
    );
  }
  if (error) return <ErrorText error={error} />;
  if (!lead) return <p className="text-sm text-neutral-500">Loading…</p>;

  // Telecallers qualify their own leads with leads.qualify; the scope check is on the server.
  const canWrite = can(TAGS.LEADS_WRITE) || can(TAGS.LEADS_QUALIFY);

  // Anyone who owns the lead may pick any active stage; admins may move any lead.
  const isOwner = lead.assignedTo?.id === user.id;
  const canMoveStage = canWrite && (can(TAGS.LEADS_READ_ALL) || isOwner);
  // Best guess at who has it, for the warning (the server decides for certain).
  const ownerIsSales = isOwner ? can(TAGS.LEADS_RECEIVE_QUALIFIED) : Boolean(lead.qualifiedAt && lead.assignedTo?.id !== lead.telecaller?.id);

  async function changeStage(stage: PipelineStage) {
    setStatusError(null);
    setStatusNotice(null);
    const effect = moveEffect(stage, { ownerIsSales, handedOver: Boolean(lead!.qualifiedAt) });
    if (effect === "handover" && !window.confirm(`Moving to "${stage.name}" hands this lead to sales: the next salesperson in turn gets it and it leaves the telecaller's worklist. Continue?`)) return;
    if (effect === "return" && !window.confirm(`Moving back to "${stage.name}" returns this lead to the telecaller who worked it (or the next one in turn). Continue?`)) return;
    const before = lead!.assignedTo?.id;
    try {
      const result = await apiPatch<LeadDetail | { id: string; movedOutOfScope: true }>(`/leads/${id}`, { stageId: stage.id });
      if ("movedOutOfScope" in result) {
        setMovedAway(`Moved to "${stage.name}". The lead went back to the telecaller, so it's no longer in your list.`);
        return;
      }
      if (result.assignedTo?.id !== before && result.assignedTo) setStatusNotice(`Moved to "${stage.name}" and handed to ${result.assignedTo.fullName}.`);
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
          <h1 className="text-2xl font-semibold tracking-tight">{leadLabel(lead)}</h1>
          <StatusBadge status={lead.status} stage={lead.stage} />
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
            <span className="inline-flex flex-wrap items-center gap-2">
              <CallButton
                leadId={lead.id}
                phone={lead.phone}
                name={leadLabel(lead)}
                variant="inline"
                onStarted={() => setHistoryVersion((v) => v + 1)}
                onLogged={() => {
                  setHistoryVersion((v) => v + 1);
                  reload();
                }}
              />
              <WhatsAppButton leadId={lead.id} name={leadLabel(lead)} direct={lead.source === "WHATSAPP"} onSent={() => setHistoryVersion((v) => v + 1)} />
            </span>
          </Detail>
          <Detail label="Email">{lead.email ?? "-"}</Detail>
          <Detail label="City">{lead.city ?? "-"}</Detail>
          <Detail label="Product interest">{productInterestLabel(lead)}</Detail>
          <Detail label="Source">
            {SOURCE_LABELS[lead.source]}
            {lead.sourceDetail && <span className="text-neutral-500"> · {lead.sourceDetail}</span>}
          </Detail>
          <LeadOwners lead={lead} onChanged={reload} />
          <Detail label="Created">
            {formatDate(lead.createdAt)} by {lead.createdBy.fullName}
          </Detail>
          {lead.closedAt && (
            <Detail label={lead.status === "WON" ? "Won on" : "Closed on"}>{formatDateTime(lead.closedAt)}</Detail>
          )}
        </section>
      )}

      {lead.salesOrder && can(TAGS.SALES_READ) && operations && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950/40">
          Converted to sales order{" "}
          <Link href={`/orders/${lead.salesOrder.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            SO-{String(lead.salesOrder.orderNumber).padStart(4, "0")}
          </Link>
          {lead.salesOrder.status === "CANCELLED" ? " (cancelled)." : "."}
        </p>
      )}
      {lead.status === "WON" &&
        operations &&
        !lead.salesOrder &&
        can(TAGS.SALES_WRITE) &&
        !editing && <ConvertToOrder lead={lead} />}

      {/* Outside the stage section: after a handover the section hides (it's the salesperson's now). */}
      {statusNotice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
          {statusNotice}
        </p>
      )}
      {canWrite && !editing && !canMoveStage && (
        <p className="text-sm text-neutral-500">
          This lead is with {lead.assignedTo?.fullName ?? "someone else"} now; only they or an admin can move its stage.
        </p>
      )}
      {canMoveStage && !editing && (
        <section>
          <h2 className="mb-2 font-medium">Move in pipeline</h2>
          {/* Every active stage, grouped by side (switched-off ones only if the lead is in one). Crossing the handover changes who has the lead. */}
          <div className="space-y-2">
            {groupedStages(stages.data, lead.stage?.id).map((group) => (
              <div key={group.side} className="flex flex-wrap items-center gap-2">
                <span className="w-44 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">{group.label}</span>
                {group.stages.map((s) => {
                  const current = s.id === lead.stage?.id;
                  return (
                    <button
                      key={s.id}
                      disabled={current}
                      aria-current={current ? "step" : undefined}
                      onClick={() => changeStage(s)}
                      className={`${secondaryButtonCompactClass} ${current ? "bg-neutral-200 dark:bg-neutral-800" : ""}`}
                      title={s.isActive ? undefined : "Switched off by admin; leads can stay here but no new moves"}
                    >
                      {s.name}
                      {s.isHandover && " (handover)"}
                      {!s.isActive && " (off)"}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <ErrorText error={statusError} />
        </section>
      )}

      <LeadNotes lead={lead} refreshKey={`${lead.updatedAt}-${historyVersion}`} />
      <LeadVoiceNotes lead={lead} refreshKey={`${lead.updatedAt}`} onAdded={() => setHistoryVersion((v) => v + 1)} />

      <ContactHistory leadId={lead.id} refreshKey={`${lead.updatedAt}-${historyVersion}`} />
      <LeadVisits lead={lead} refreshKey={`${lead.updatedAt}-${historyVersion}`} onCheckedIn={() => setHistoryVersion((v) => v + 1)} />

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

      <LeadHistoryTimeline leadId={lead.id} refreshKey={`${lead.updatedAt}-${historyVersion}-${lead.followUps.length}-${lead.followUps.filter((f) => f.completedAt).length}`} />
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
