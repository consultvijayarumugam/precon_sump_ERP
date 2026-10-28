"use client";

import { AlarmClock, CalendarClock, Phone, PhoneCall, PhoneOutgoing, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CallbackPanel, LogCallPanel, QualifyPanel } from "@/components/lead-quick-actions";
import { ErrorText, panelClass, secondaryButtonSmClass, StatusBadge } from "@/components/ui";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { formatDateTime, formatTime, productInterestLabel, SOURCE_LABELS } from "@/lib/crm";
import { useApi } from "@/lib/use-api";
import {
  BUCKET_LABELS,
  CALL_OUTCOME_LABELS,
  TelecallerDashboardData,
  WorklistBucket,
  WorklistItem,
} from "@/lib/workflow";
import { MyReminders } from "./my-reminders";
import { EmptyNote, Greeting, KpiRow, KpiTile } from "./shared";

const BUCKET_ORDER: WorklistBucket[] = ["overdue", "today", "new", "no_next_step", "later"];

const BUCKET_STYLE: Record<WorklistBucket, string> = {
  overdue: "text-red-700 dark:text-red-300",
  today: "text-amber-700 dark:text-amber-300",
  new: "text-brand-700 dark:text-brand-300",
  no_next_step: "text-neutral-700 dark:text-neutral-300",
  later: "text-neutral-500",
};

/** "3h ago", "2d ago" */
function ago(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

type Panel = "call" | "callback" | "qualify" | null;

function WorkCard({ item, now, onChanged, onHandedOver }: { item: WorklistItem; now: number; onChanged: () => void; onHandedOver: (msg: string) => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const overdue = item.bucket === "overdue";
  const callback = item.nextCallback;

  return (
    <li
      className={`${panelClass} p-4 ${overdue ? "border-red-200 ring-1 ring-red-100 dark:border-red-900 dark:ring-red-950" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/leads/${item.id}`} className="text-base font-semibold text-neutral-900 hover:text-brand-700 dark:text-white">
              {item.name}
            </Link>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {SOURCE_LABELS[item.source]} · arrived {ago(item.createdAt, now)}
            {item.city && ` · ${item.city}`}
            {item.productInterest && ` · ${productInterestLabel(item)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`tel:${item.phone}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700"
          >
            <Phone className="size-4" aria-hidden /> {item.phone}
          </a>
          <WhatsAppButton leadId={item.id} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className={overdue ? "font-semibold text-red-700 dark:text-red-300" : "text-neutral-600 dark:text-neutral-400"}>
          <CalendarClock className="mr-1 inline size-4 align-[-3px]" aria-hidden />
          {callback ? `Callback ${overdue ? "was due" : "due"} ${formatDateTime(callback.scheduledAt)}` : "No callback set"}
        </span>
        <span className="text-neutral-600 dark:text-neutral-400">
          <PhoneOutgoing className="mr-1 inline size-4 align-[-3px]" aria-hidden />
          {item.lastCall
            ? `Last call: ${CALL_OUTCOME_LABELS[item.lastCall.outcome]}, ${ago(item.lastCall.calledAt, now)} (${item.callCount} call${item.callCount === 1 ? "" : "s"})`
            : "Not called yet"}
        </span>
      </div>
      {item.lastCall?.note && <p className="mt-1 text-sm text-neutral-500">“{item.lastCall.note}”</p>}

      {panel === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonSmClass} onClick={() => setPanel("call")}>
            <PhoneCall className="size-4" aria-hidden /> Log call
          </button>
          <button type="button" className={secondaryButtonSmClass} onClick={() => setPanel("callback")}>
            <AlarmClock className="size-4" aria-hidden /> {callback ? "Change callback" : "Set callback"}
          </button>
          <button
            type="button"
            className={`${secondaryButtonSmClass} border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300`}
            onClick={() => setPanel("qualify")}
          >
            <Sparkles className="size-4" aria-hidden /> Qualify
          </button>
        </div>
      )}
      {panel === "call" && (
        <LogCallPanel
          leadId={item.id}
          onCancel={() => setPanel(null)}
          onDone={({ interested }) => {
            if (interested) setPanel("qualify");
            else {
              setPanel(null);
              onChanged();
            }
          }}
        />
      )}
      {panel === "callback" && (
        <CallbackPanel
          leadId={item.id}
          current={callback?.scheduledAt ?? null}
          onCancel={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            onChanged();
          }}
        />
      )}
      {panel === "qualify" && (
        <QualifyPanel
          lead={item}
          onCancel={() => {
            setPanel(null);
            onChanged();
          }}
          onDone={(handedTo) => {
            setPanel(null);
            onHandedOver(`${item.name} is qualified and handed to ${handedTo}.`);
          }}
        />
      )}
    </li>
  );
}

/** Telecaller landing page: who to call next, and how today is going. */
export function TelecallerDashboard() {
  const { data, error, reload } = useApi<TelecallerDashboardData>("/dashboards/telecaller");
  const [now] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [showLater, setShowLater] = useState(false);
  const c = data?.counts;

  return (
    <div className="space-y-6">
      <Greeting
        subtitle={
          c
            ? `${c.overdue + c.callbacksDueToday + c.notCalledYet} leads to call now. Top of the list first.`
            : "Your call list, most urgent first."
        }
      />
      <ErrorText error={error} />
      <MyReminders />
      <KpiRow>
        <KpiTile label="My new leads today" value={c?.newToday} href="/leads?status=NEW" icon={Sparkles} module="crm" hint={c && `${c.notCalledYet} not called yet`} />
        <KpiTile label="Callbacks due today" value={c?.callbacksDueToday} href="/follow-ups" icon={CalendarClock} module="crm" />
        <KpiTile label="My overdue callbacks" value={c?.overdue} href="/follow-ups" icon={AlarmClock} module="crm" alert={(c?.overdue ?? 0) > 0} />
        <KpiTile
          label="Calls logged today"
          value={c?.callsToday}
          href="/follow-ups"
          icon={PhoneCall}
          module="crm"
          hint={c && `${c.callsThisWeek} this week · ${c.qualifiedToday} qualified today`}
        />
      </KpiRow>

      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
          ✓ {notice}
        </p>
      )}

      {data && data.items.length === 0 && <EmptyNote>Nothing to call right now. New leads appear here as they arrive.</EmptyNote>}
      {data &&
        BUCKET_ORDER.map((bucket) => {
          const items = data.items.filter((i) => i.bucket === bucket);
          if (items.length === 0) return null;
          const collapsed = bucket === "later" && !showLater;
          return (
            <section key={bucket} aria-label={BUCKET_LABELS[bucket]}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className={`text-sm font-bold uppercase tracking-wider ${BUCKET_STYLE[bucket]}`}>
                  {BUCKET_LABELS[bucket]} · {items.length}
                </h2>
                {bucket === "later" && (
                  <button type="button" className="text-sm font-medium text-brand-700 dark:text-brand-300" onClick={() => setShowLater((v) => !v)}>
                    {showLater ? "Hide" : "Show"}
                  </button>
                )}
              </div>
              {!collapsed && (
                <ul className="space-y-3">
                  {items.map((item) => (
                    <WorkCard
                      key={item.id}
                      item={item}
                      now={now}
                      onChanged={() => {
                        setNotice(null);
                        reload();
                      }}
                      onHandedOver={(msg) => {
                        setNotice(msg);
                        reload();
                      }}
                    />
                  ))}
                </ul>
              )}
              {collapsed && (
                <p className="text-sm text-neutral-500">
                  {items.length} lead{items.length === 1 ? "" : "s"} with a callback after today
                  {items[0]?.nextCallback && `, next ${formatDateTime(items[0].nextCallback.scheduledAt)}`}.
                </p>
              )}
            </section>
          );
        })}
      {c && <p className="text-xs text-neutral-500">Updated {formatTime(new Date(now).toISOString())}. Logging a call or a callback refreshes the list.</p>}
    </div>
  );
}
