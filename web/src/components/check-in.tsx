"use client";

import { MapPin, Navigation } from "lucide-react";
import { useMemo, useState } from "react";
import { MapPin as Pin, OsmMap } from "@/components/osm-map";
import { buttonClass, inputClass } from "@/components/ui";
import { apiPost } from "@/lib/api";
import { formatDateTime, LeadStatus, STATUS_LABELS } from "@/lib/crm";
import { useApi } from "@/lib/use-api";
import { CheckIn } from "@/lib/workflow";

const PERSON_COLORS = ["#2557eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

/** Pins for check-ins, one colour per person. */
export function useCheckInPins(visits: CheckIn[] | undefined) {
  return useMemo(() => {
    const people = [...new Map((visits ?? []).map((v) => [v.person.id, v.person.fullName])).entries()];
    const colorOf = new Map(people.map(([id], i) => [id, PERSON_COLORS[i % PERSON_COLORS.length]]));
    const pins: Pin[] = (visits ?? []).map((v) => ({
      id: v.id,
      latitude: v.latitude,
      longitude: v.longitude,
      title: v.lead?.name ?? v.customerName,
      subtitle: `${v.person.fullName} · ${formatDateTime(v.checkedInAt)}`,
      color: colorOf.get(v.person.id),
    }));
    return { pins, legend: people.map(([id, name]) => ({ id, name, color: colorOf.get(id)! })) };
  }, [visits]);
}

export const osmLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

/**
 * "I'm at site": reads the device's location once (browser geolocation),
 * stores it with the time against one of your leads, and it appears as a pin
 * and in that lead's history. No tracking. Pass `leadId` to fix the lead (on
 * its page); otherwise you pick from the leads assigned to you.
 */
export function CheckInButton({ leadId: fixedLeadId, onCheckedIn }: { leadId?: string; onCheckedIn: () => void }) {
  const mine = useApi<{ id: string; name: string; city: string | null; status: LeadStatus }[]>(fixedLeadId ? null : "/check-ins/leads");
  const [chosen, setChosen] = useState("");
  const leadId = fixedLeadId ?? chosen;
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "locating" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function checkIn() {
    setError(null);
    setDone(null);
    if (!leadId) {
      setError("Pick the lead you're visiting first.");
      return;
    }
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setError(
        "This browser only shares location on a secure page (https://, or http://localhost on this computer). " +
          "Over the local network address it is blocked; it will work once the app has HTTPS.",
      );
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setState("saving");
        try {
          await apiPost("/check-ins", {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: Math.round(pos.coords.accuracy),
            leadId,
            note: note || undefined,
          });
          setDone(`Checked in at ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (±${Math.round(pos.coords.accuracy)} m).`);
          setNote("");
          onCheckedIn();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save the check-in");
        } finally {
          setState("idle");
        }
      },
      (err) => {
        setState("idle");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Allow location for this site in the browser settings and try again."
            : err.code === err.TIMEOUT
              ? "Couldn't get a GPS fix in time. Step outside or near a window and try again."
              : "Your location isn't available right now. Turn on location (GPS) and try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  return (
    <div className="space-y-3">
      <div className={`grid gap-2 ${fixedLeadId ? "" : "sm:grid-cols-2"}`}>
        {!fixedLeadId && (
          <select className={inputClass} value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label="Which lead are you visiting?">
            <option value="">Which lead are you visiting? *</option>
            {mine.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.city ? ` · ${l.city}` : ""} ({STATUS_LABELS[l.status]})
              </option>
            ))}
          </select>
        )}
        <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Visit note" />
      </div>
      {!fixedLeadId && mine.data?.length === 0 && <p className="text-sm text-neutral-500">No leads are assigned to you yet, so there is nothing to check in for.</p>}
      <button type="button" className={`${buttonClass} w-full sm:w-auto`} onClick={checkIn} disabled={state !== "idle" || !leadId}>
        <Navigation className="size-4" aria-hidden />
        {state === "locating" ? "Getting your location…" : state === "saving" ? "Saving…" : "I'm at site"}
      </button>
      <p className="text-xs text-neutral-500">
        Takes one location reading now, with the time, and records it on the lead. Nothing is tracked afterwards.
      </p>
      {done && (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300" role="status">
          <MapPin className="mr-1 inline size-4 align-[-3px]" aria-hidden />
          {done}
        </p>
      )}
      {error && (
        <p className="text-sm font-medium text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function VisitsMap({ visits, height = 300 }: { visits: CheckIn[]; height?: number }) {
  const { pins, legend } = useCheckInPins(visits);
  return (
    <div className="space-y-2">
      <OsmMap pins={pins} height={height} emptyText="No site check-ins yet." />
      {legend.length > 1 && (
        <div className="flex flex-wrap gap-3 text-xs text-neutral-600 dark:text-neutral-400">
          {legend.map((l) => (
            <span key={l.id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: l.color }} aria-hidden />
              {l.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
