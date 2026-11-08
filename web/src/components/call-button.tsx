"use client";

import { Check, Copy, Phone } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { AnchoredPanel } from "@/components/anchored-panel";
import { useAuth } from "@/components/auth-provider";
import { LogCallPanel } from "@/components/lead-quick-actions";
import { secondaryButtonSmClass } from "@/components/ui";
import { api } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { displayPhone, telNumber } from "@/lib/phone";
import { TAGS } from "@/lib/tags";

/** icon: a square button beside a visible number. inline: icon + number. block: fills its cell, for phones. */
export type ContactVariant = "icon" | "inline" | "block";

const LOOK: Record<ContactVariant, string> = {
  icon: "size-11 lg:size-9",
  inline: "h-11 px-3 text-sm font-semibold",
  block: "h-12 w-full px-3 text-sm font-semibold sm:h-10 sm:w-auto",
};

/**
 * Call button for a lead. It's a tel: link, so a phone opens its dialer with
 * the number filled in. Tapping also records the attempt on the lead and opens
 * a sheet that's waiting when the user comes back from the call: the number
 * (with Copy, for computers that can't dial) and the outcome form.
 */
export function CallButton({
  leadId,
  phone,
  name,
  variant = "icon",
  onStarted,
  onLogged,
}: {
  leadId: string;
  phone: string;
  name: string;
  variant?: ContactVariant;
  /** The attempt was recorded (refresh a history list). */
  onStarted?: () => void;
  /** The outcome was saved; `interested` lets the caller open Qualify next. */
  onLogged?: (result: { interested: boolean }) => void;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [notRecorded, setNotRecorded] = useState(false);
  const button = useRef<HTMLAnchorElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const tel = telNumber(phone);

  if (!tel) return variant === "icon" ? null : <span className="text-sm">{phone}</span>;
  const shown = displayPhone(tel);

  function started() {
    setOpen(true);
    setCopied(null);
    setNotRecorded(false);
    // keepalive: the dialer may push this page to the background straight away.
    api(`/leads/${leadId}/call-attempts`, { method: "POST", keepalive: true }).then(
      () => onStarted?.(),
      () => setNotRecorded(true), // never get in the way of the call itself
    );
  }

  return (
    <>
      <a
        ref={button}
        href={`tel:${tel}`}
        onClick={started}
        aria-label={`Call ${name} on ${shown}`}
        title={`Call ${shown}`}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--ps-blue-600)] text-white shadow-xs hover:opacity-90 ${LOOK[variant]}`}
      >
        <Phone className="size-[18px]" aria-hidden />
        {variant !== "icon" && <span className="tabular-nums">{phone}</span>}
      </a>
      {open && (
        <AnchoredPanel anchor={button} label={`Call ${name}`} onClose={close}>
          <div className="px-1 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Calling {name}</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="select-all text-xl font-bold tabular-nums text-neutral-900 dark:text-white">{shown}</span>
              <button type="button" className={secondaryButtonSmClass} onClick={async () => setCopied(await copyText(tel))}>
                {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {copied === false ? "Couldn't copy here; select the number above." : "Dialer didn't open? Dial this number from your phone."}
            </p>
            {notRecorded && <p className="mt-1 text-xs font-medium text-red-600">This call attempt couldn&apos;t be recorded.</p>}
          </div>
          {can(TAGS.FOLLOWUPS_WRITE) ? (
            <LogCallPanel
              leadId={leadId}
              onCancel={close}
              onDone={({ interested }) => {
                close();
                onLogged?.({ interested });
              }}
            />
          ) : (
            <button type="button" className={`${secondaryButtonSmClass} mt-3`} onClick={close}>
              Close
            </button>
          )}
        </AnchoredPanel>
      )}
    </>
  );
}
