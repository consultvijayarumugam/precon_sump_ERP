"use client";

import { Bell, CalendarClock, UserPlus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { formatDateTime } from "@/lib/crm";
import { useApi } from "@/lib/use-api";

interface Item {
  id: string;
  type: "LEAD_ASSIGNED" | "LEAD_HANDED_OVER" | "FOLLOW_UP_DUE";
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  lead: { id: string; name: string; phone: string } | null;
  followUp: { id: string; scheduledAt: string; note: string | null } | null;
  overdue?: boolean;
}
interface Feed {
  unread: number;
  reminders: Item[];
  updates: Item[];
}

const POLL_MS = 60_000;

/** Top-bar bell: due/overdue callbacks and leads assigned or handed to you. In-app only. */
export function NotificationBell() {
  const router = useRouter();
  const { data, reload } = useApi<Feed>("/notifications");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Check again every minute and whenever the bell is opened.
  useEffect(() => {
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function openItem(item: Item) {
    if (!item.readAt) await apiPost(`/notifications/${item.id}/read`).catch(() => undefined);
    setOpen(false);
    reload();
    if (item.lead) router.push(`/leads/${item.lead.id}`);
  }

  async function readAll() {
    await apiPost("/notifications/read-all").catch(() => undefined);
    reload();
  }

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) reload();
        }}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-xs hover:text-brand-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-5 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
            <span className="text-sm font-bold">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {data && data.reminders.length === 0 && data.updates.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">You&apos;re all caught up.</p>
            )}
            {data && data.reminders.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Reminders</p>
                <ul>
                  {data.reminders.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => openItem(r)} className="flex w-full gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60">
                        <CalendarClock className={`mt-0.5 size-4 shrink-0 ${r.overdue ? "text-red-600" : "text-amber-600"}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${r.readAt ? "" : "font-semibold"}`}>{r.title}</span>
                          <span className={`block text-xs ${r.overdue ? "font-medium text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
                            {r.overdue ? "Overdue since" : "Due"} {r.followUp && formatDateTime(r.followUp.scheduledAt)}
                            {r.body && <span className="text-neutral-500"> · {r.body}</span>}
                          </span>
                        </span>
                        {!r.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" aria-label="unread" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {data && data.updates.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Updates</p>
                <ul className="pb-2">
                  {data.updates.map((u) => (
                    <li key={u.id}>
                      <button type="button" onClick={() => openItem(u)} className="flex w-full gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60">
                        {u.type === "LEAD_HANDED_OVER" ? (
                          <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                        ) : (
                          <UserPlus className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${u.readAt ? "text-neutral-600 dark:text-neutral-400" : "font-semibold"}`}>{u.title}</span>
                          <span className="block text-xs text-neutral-500">
                            {formatDateTime(u.createdAt)}
                            {u.body && ` · ${u.body}`}
                          </span>
                        </span>
                        {!u.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" aria-label="unread" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <p className="border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800">
            In-app only. Reminders clear themselves when the callback is done.
          </p>
        </div>
      )}
    </div>
  );
}
