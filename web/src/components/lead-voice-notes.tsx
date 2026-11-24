"use client";

import { Loader2, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { buttonSmClass, ErrorText, panelClass, secondaryButtonSmClass } from "@/components/ui";
import { apiBlob, apiUpload } from "@/lib/api";
import { formatDateTime, LeadDetail, TAGS } from "@/lib/crm";
import { useApi } from "@/lib/use-api";
import {
  fileNameFor,
  formatDuration,
  MAX_VOICE_NOTE_MS,
  micErrorMessage,
  pickRecorderMime,
  secondsLeft,
  VOICE_BITS_PER_SECOND,
  type VoiceNote,
} from "@/lib/voice-notes";

/**
 * Play/pause with elapsed and total time. The recording is fetched (with the
 * login token) only when first played, then kept for this page view. The total
 * comes from what was recorded, since browser WebM files often don't say.
 */
function VoicePlayer({ load, durationMs, label }: { load: () => Promise<Blob>; durationMs: number; label: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  async function toggle() {
    setError(null);
    if (audio.current && !audio.current.paused) {
      audio.current.pause();
      return;
    }
    if (!audio.current) {
      setLoading(true);
      try {
        objectUrl.current = URL.createObjectURL(await load());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the recording.");
        setLoading(false);
        return;
      }
      const el = new Audio(objectUrl.current);
      el.addEventListener("play", () => setPlaying(true));
      el.addEventListener("pause", () => setPlaying(false));
      el.addEventListener("timeupdate", () => setPositionMs(el.currentTime * 1000));
      el.addEventListener("ended", () => {
        setPlaying(false);
        setPositionMs(0);
      });
      el.addEventListener("error", () => setError("This browser can't play this recording."));
      audio.current = el;
      setLoading(false);
    }
    try {
      await audio.current.play();
    } catch {
      setError("This browser can't play this recording.");
    }
  }

  const pct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60"
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : playing ? <Pause className="size-4" aria-hidden /> : <Play className="ml-0.5 size-4" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700" aria-hidden>
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-xs tabular-nums text-neutral-500">
          {formatDuration(Math.min(positionMs, durationMs))} / {formatDuration(durationMs)}
        </div>
        {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}

type Recorder =
  | { state: "idle" }
  | { state: "starting" }
  | { state: "recording"; startedAt: number }
  | { state: "review"; blob: Blob; mimeType: string; durationMs: number };

/** Record → listen back → Save or Discard. Nothing is uploaded until Save. */
function VoiceRecorder({ leadId, onSaved }: { leadId: string; onSaved: () => void }) {
  const [rec, setRec] = useState<Recorder>({ state: "idle" });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const media = useRef<{ recorder: MediaRecorder; stream: MediaStream; timer: number } | null>(null);

  // Leaving the page mid-recording releases the microphone.
  useEffect(
    () => () => {
      if (!media.current) return;
      window.clearInterval(media.current.timer);
      media.current.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    setError(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(micErrorMessage({ name: "Unsupported" }));
      return;
    }
    setRec({ state: "starting" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (err) {
      setError(micErrorMessage(err));
      setRec({ state: "idle" });
      return;
    }
    const mime = pickRecorderMime((t) => MediaRecorder.isTypeSupported(t));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: VOICE_BITS_PER_SECOND });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setError(micErrorMessage(err));
      setRec({ state: "idle" });
      return;
    }
    const chunks: Blob[] = [];
    const startedAt = performance.now();
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const durationMs = Math.min(Math.round(performance.now() - startedAt), MAX_VOICE_NOTE_MS);
      if (media.current) window.clearInterval(media.current.timer);
      stream.getTracks().forEach((t) => t.stop());
      media.current = null;
      const mimeType = recorder.mimeType || mime || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0 || durationMs < 500) {
        setError("That was too short to keep. Press Record and speak, then Stop.");
        setRec({ state: "idle" });
        return;
      }
      setRec({ state: "review", blob, mimeType, durationMs });
    };
    const timer = window.setInterval(() => {
      const ms = performance.now() - startedAt;
      setElapsedMs(ms);
      if (ms >= MAX_VOICE_NOTE_MS && recorder.state === "recording") recorder.stop(); // the 2-minute cap
    }, 250);
    media.current = { recorder, stream, timer };
    setElapsedMs(0);
    recorder.start(1000);
    setRec({ state: "recording", startedAt });
  }

  function stop() {
    if (media.current?.recorder.state === "recording") media.current.recorder.stop();
  }

  async function save() {
    if (rec.state !== "review") return;
    setSaving(true);
    setError(null);
    try {
      await apiUpload(`/leads/${leadId}/voice-notes`, rec.blob, { durationMs: String(rec.durationMs) }, "audio", fileNameFor(rec.mimeType));
      setRec({ state: "idle" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the voice note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${panelClass} p-3`}>
      {(rec.state === "idle" || rec.state === "starting") && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={buttonSmClass} onClick={start} disabled={rec.state === "starting"}>
            <Mic className="size-4" aria-hidden /> {rec.state === "starting" ? "Starting…" : "Record voice note"}
          </button>
          <span className="text-xs text-neutral-500">Up to 2 minutes. Your browser will ask to use the microphone.</span>
        </div>
      )}
      {rec.state === "recording" && (
        <div className="flex flex-wrap items-center gap-3" role="status" aria-live="polite">
          <span className="relative flex size-3" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-3 rounded-full bg-red-600" />
          </span>
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">Recording</span>
          <span className="text-sm tabular-nums">
            {formatDuration(elapsedMs)} / {formatDuration(MAX_VOICE_NOTE_MS)}
          </span>
          {secondsLeft(elapsedMs) <= 15 && <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{secondsLeft(elapsedMs)}s left</span>}
          <button type="button" className={`${secondaryButtonSmClass} ml-auto`} onClick={stop}>
            <Square className="size-3.5 fill-current" aria-hidden /> Stop
          </button>
        </div>
      )}
      {rec.state === "review" && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Listen back, then save it to the lead or discard it.</p>
          <VoicePlayer load={async () => rec.blob} durationMs={rec.durationMs} label="your recording" />
          <div className="flex gap-2">
            <button type="button" className={buttonSmClass} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save voice note"}
            </button>
            <button type="button" className={secondaryButtonSmClass} onClick={() => setRec({ state: "idle" })} disabled={saving}>
              <Trash2 className="size-3.5" aria-hidden /> Discard
            </button>
          </div>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}

/**
 * The lead's voice notes: everyone who can see the lead (its salesperson, the
 * telecaller who worked it, admins) can play them; those who can note on the
 * lead can record. In addition to the typed shared notes.
 */
export function LeadVoiceNotes({ lead, refreshKey, onAdded }: { lead: LeadDetail; refreshKey: string; onAdded?: () => void }) {
  const { user, can } = useAuth();
  const notes = useApi<VoiceNote[]>(`/leads/${lead.id}/voice-notes?r=${refreshKey}`);
  const canRecord = can(TAGS.LEADS_WRITE) || can(TAGS.LEADS_QUALIFY);
  const count = notes.data?.length ?? 0;

  return (
    <section className="space-y-3" aria-labelledby="voice-notes">
      <h2 id="voice-notes" className="flex items-center gap-2 font-medium">
        <Mic className="size-4 text-brand-600" aria-hidden />
        Voice notes{count > 0 && <span className="text-neutral-500">· {count}</span>}
      </h2>
      <ErrorText error={notes.error} />
      {notes.data && notes.data.length > 0 && (
        <ul className={`${panelClass} divide-y divide-neutral-100 dark:divide-neutral-800`}>
          {notes.data.map((n) => {
            const who = n.author.id === user.id ? "You" : n.author.fullName;
            return (
              <li key={n.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="text-sm sm:w-56 sm:shrink-0">
                  <span className="font-semibold">{who}</span>
                  <span className="text-neutral-500"> · {n.author.role.name}</span>
                  <div className="text-xs text-neutral-500">{formatDateTime(n.createdAt)}</div>
                </div>
                <VoicePlayer
                  load={() => apiBlob(`/leads/${lead.id}/voice-notes/${n.id}/audio`)}
                  durationMs={n.durationMs}
                  label={`voice note from ${who}, ${formatDateTime(n.createdAt)}`}
                />
              </li>
            );
          })}
        </ul>
      )}
      {notes.data && notes.data.length === 0 && <p className="text-sm text-neutral-500">No voice notes yet.</p>}
      {canRecord && (
        <VoiceRecorder
          leadId={lead.id}
          onSaved={() => {
            notes.reload();
            onAdded?.();
          }}
        />
      )}
    </section>
  );
}
