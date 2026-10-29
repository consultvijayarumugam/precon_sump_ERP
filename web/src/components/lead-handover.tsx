"use client";

// Lead page pieces for the telecaller → sales handover: who has the lead
// (salesperson + telecaller), changing the salesperson, the lead's site visits,
// and the admin-only change history timeline.
import {
  ArrowRightLeft,
  CalendarCheck,
  CalendarPlus,
  CircleDot,
  History,
  MapPin,
  MessageCircle,
  PencilLine,
  PhoneCall,
  Sparkles,
  StickyNote,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CheckInButton, osmLink, VisitsMap } from "@/components/check-in";
import { buttonSmClass, ErrorText, inputClass, panelClass, secondaryButtonSmClass } from "@/components/ui";
import { apiPut } from "@/lib/api";
import { formatDateTime, formatLitres, LeadDetail, LeadStatus, PRODUCT_LABELS, ProductInterest, STATUS_LABELS } from "@/lib/crm";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";
import { CheckIn } from "@/lib/workflow";

/** "Salesperson: X · Telecaller: Y" once handed over; otherwise "Assigned to". */
export function LeadOwners({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
  const { user, can } = useAuth();
  const handedOver = Boolean(lead.qualifiedAt) && lead.status !== "NEW" && lead.status !== "CONTACTED";
  const mayChange = handedOver && (can(TAGS.LEADS_ASSIGN) || (can(TAGS.LEADS_QUALIFY) && lead.telecaller?.id === user.id));
  const [editing, setEditing] = useState(false);
  const team = useApi<{ members: { id: string; fullName: string; inRotation: boolean }[] }>(editing ? "/sales-team" : null);
  const [choice, setChoice] = useState("");
  const save = useAction();

  if (!handedOver) {
    return (
      <div>
        <span className="text-neutral-500">Assigned to: </span>
        {lead.assignedTo?.fullName ?? "Unassigned"}
        {lead.autoAssigned && <span className="text-neutral-500"> · round-robin</span>}
      </div>
    );
  }
  return (
    <>
      <div>
        <span className="text-neutral-500">Salesperson: </span>
        <span className="font-medium">{lead.assignedTo?.fullName ?? "Unassigned"}</span>
        {mayChange && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="ml-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Change
          </button>
        )}
        {editing && (
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <select className={`${inputClass} w-auto`} value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="New salesperson">
              <option value="">Pick a salesperson…</option>
              {team.data?.members
                .filter((m) => m.id !== lead.assignedTo?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                    {m.inRotation ? "" : " (not taking new leads)"}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className={buttonSmClass}
              disabled={!choice || save.busy}
              onClick={async () => {
                if (await save.run(() => apiPut(`/leads/${lead.id}/salesperson`, { salesUserId: choice }))) {
                  setEditing(false);
                  setChoice("");
                  onChanged();
                }
              }}
            >
              Save
            </button>
            <button type="button" className={secondaryButtonSmClass} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <ErrorText error={save.error} />
          </span>
        )}
      </div>
      <div>
        <span className="text-neutral-500">Telecaller: </span>
        {lead.telecaller?.fullName ?? "–"}
        {lead.qualifiedAt && <span className="text-neutral-500"> · handed over {formatDateTime(lead.qualifiedAt)}</span>}
      </div>
    </>
  );
}

/** Site visits recorded on this lead, with a map; the assigned salesperson can check in here. */
export function LeadVisits({ lead, refreshKey, onCheckedIn }: { lead: LeadDetail; refreshKey: string; onCheckedIn: () => void }) {
  const { user, can } = useAuth();
  const visits = useApi<CheckIn[]>(`/leads/${lead.id}/visits?r=${refreshKey}`);
  const canCheckIn = can(TAGS.SITEVISIT_WRITE) && lead.assignedTo?.id === user.id;
  if (!visits.data?.length && !canCheckIn) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-medium">
        Site visits{visits.data && visits.data.length > 0 && <span className="ml-1 text-neutral-500">· {visits.data.length}</span>}
      </h2>
      <ErrorText error={visits.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {canCheckIn && (
            <div className={`${panelClass} p-4`}>
              <h3 className="mb-2 text-sm font-semibold">I&apos;m at this site</h3>
              <CheckInButton leadId={lead.id} onCheckedIn={onCheckedIn} />
            </div>
          )}
          {visits.data && visits.data.length > 0 && (
            <ul className={`${panelClass} divide-y divide-neutral-100 text-sm dark:divide-neutral-800`}>
              {visits.data.map((v) => (
                <li key={v.id} className="px-4 py-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{v.person.fullName}</span>
                    <span className="text-xs text-neutral-500">{formatDateTime(v.checkedInAt)}</span>
                  </div>
                  <a href={osmLink(v.latitude, v.longitude)} target="_blank" rel="noreferrer" className="text-xs text-brand-700 hover:underline dark:text-brand-300">
                    {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                    {v.accuracyMeters !== null && ` (±${v.accuracyMeters} m)`}
                  </a>
                  {v.notes && <p className="text-neutral-600 dark:text-neutral-400">{v.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {visits.data && visits.data.length > 0 && <VisitsMap visits={visits.data} height={260} />}
      </div>
    </section>
  );
}

interface HistoryEntry {
  id: string;
  type: string;
  message: string;
  templateName: string | null;
  changes: { field: string; label: string; from: string | null; to: string | null }[] | null;
  createdAt: string;
  user: { id: string; fullName: string; role: { name: string } };
}

const TYPE_LOOK: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  CREATED: { icon: CircleDot, tone: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300", label: "Created" },
  ASSIGNED: { icon: UserPlus, tone: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300", label: "Assignment" },
  HANDED_OVER: { icon: Sparkles, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", label: "Handed to sales" },
  STATUS_CHANGED: { icon: ArrowRightLeft, tone: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300", label: "Status" },
  FIELD_CHANGED: { icon: PencilLine, tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300", label: "Details edited" },
  NOTES_EDITED: { icon: StickyNote, tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300", label: "Notes" },
  FOLLOW_UP_CREATED: { icon: CalendarPlus, tone: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300", label: "Follow-up" },
  FOLLOW_UP_RESCHEDULED: { icon: CalendarPlus, tone: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300", label: "Follow-up moved" },
  FOLLOW_UP_COMPLETED: { icon: CalendarCheck, tone: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300", label: "Follow-up done" },
  FOLLOW_UP_REOPENED: { icon: CalendarPlus, tone: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300", label: "Follow-up reopened" },
  CALL_LOGGED: { icon: PhoneCall, tone: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200", label: "Call" },
  WHATSAPP: { icon: MessageCircle, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", label: "WhatsApp" },
  SITE_VISIT: { icon: MapPin, tone: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300", label: "Site visit" },
};

/** Status codes read better as words in the timeline; other values show as stored. */
function value(field: string, v: string | null) {
  if (v === null) return <em className="text-neutral-400">empty</em>;
  if (field === "status" && v in STATUS_LABELS) return STATUS_LABELS[v as LeadStatus];
  if (field === "productInterest" && v in PRODUCT_LABELS) return PRODUCT_LABELS[v as ProductInterest];
  if (field === "sumpSizeLitres" && /^\d+$/.test(v)) return formatLitres(Number(v));
  if (field === "scheduledAt" && !Number.isNaN(Date.parse(v))) return formatDateTime(v);
  return v;
}

/** Admin only: every change on the lead, who made it, from → to, and when. */
export function LeadHistoryTimeline({ leadId, refreshKey }: { leadId: string; refreshKey: string }) {
  const { can } = useAuth();
  const allowed = can(TAGS.LEADS_AUDIT);
  const { data, error } = useApi<HistoryEntry[]>(allowed ? `/leads/${leadId}/history?r=${refreshKey}` : null);
  const [showAll, setShowAll] = useState(false);
  if (!allowed) return null;
  const shown = showAll ? data : data?.slice(0, 25);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-medium">
        <History className="size-4 text-brand-600" aria-hidden /> Change history
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">Admin only</span>
        {data && <span className="text-sm font-normal text-neutral-500">· {data.length} entries</span>}
      </h2>
      <ErrorText error={error} />
      {data && data.length === 0 && <p className="text-sm text-neutral-500">No changes recorded yet.</p>}
      {shown && shown.length > 0 && (
        <ol className={`${panelClass} relative px-4 py-3`}>
          {shown.map((e, i) => {
            const look = TYPE_LOOK[e.type] ?? TYPE_LOOK.CREATED;
            const Icon = look.icon;
            return (
              <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < shown.length - 1 && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-neutral-200 dark:bg-neutral-800" aria-hidden />}
                <span className={`z-10 grid size-8 shrink-0 place-items-center rounded-full ${look.tone}`}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>
                      <span className="font-semibold">{look.label}</span>
                      <span className="text-neutral-500">
                        {" "}
                        by {e.user.fullName} ({e.user.role.name})
                      </span>
                    </span>
                    <time className="text-xs text-neutral-500" dateTime={e.createdAt}>
                      {formatDateTime(e.createdAt)}
                    </time>
                  </div>
                  <p className="text-neutral-700 dark:text-neutral-300">
                    {e.type === "WHATSAPP" ? `${e.templateName ?? "Chat opened"}: ${e.message}` : e.message}
                  </p>
                  {/* The one-line summary already says it for most entries; spell out the details for handovers and notes. */}
                  {e.changes && e.changes.length > 0 && (e.type === "HANDED_OVER" || e.type === "NOTES_EDITED") && (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {e.changes.map((c, j) => (
                        <li key={j} className="text-neutral-600 dark:text-neutral-400">
                          <span className="font-medium">{c.label}:</span>{" "}
                          {c.field === "notes" ? (
                            <span className="block whitespace-pre-wrap rounded bg-neutral-50 px-2 py-1 dark:bg-neutral-950">
                              <span className="line-through opacity-60">{c.from ?? ""}</span>
                              {c.from && <br />}
                              {c.to ?? ""}
                            </span>
                          ) : (
                            <>
                              {value(c.field, c.from)} → <span className="font-medium text-neutral-800 dark:text-neutral-200">{value(c.field, c.to)}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {data && data.length > 25 && (
        <button type="button" className={secondaryButtonSmClass} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show the latest 25" : `Show all ${data.length}`}
        </button>
      )}
    </section>
  );
}
