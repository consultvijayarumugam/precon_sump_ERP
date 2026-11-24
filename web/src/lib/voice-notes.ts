// Voice notes on a lead: recorded audio (no transcription). Pure helpers, tested in voice-notes.test.ts.

export interface VoiceNote {
  id: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  createdAt: string;
  author: { id: string; fullName: string; role: { key: string; name: string } };
}

/** Each note is capped at 2 minutes (the server allows a few seconds' grace). */
export const MAX_VOICE_NOTE_MS = 120_000;
/** Speech-quality compression: 2 minutes ≈ 0.5 MB. */
export const VOICE_BITS_PER_SECOND = 32_000;

/** "1:05" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The recording format this browser can make that every other browser and the
 * phone app can play: AAC in MP4 first (Safari, newer Chrome), then Opus in
 * WebM (Chrome, Edge, Firefox), then Ogg. Null = the browser picks.
 */
export function pickRecorderMime(isTypeSupported: (type: string) => boolean): string | null {
  const candidates = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // some browsers throw for unknown types; try the next one
    }
  }
  return null;
}

/** A file name the server can see the format from (it still checks the bytes). */
export function fileNameFor(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "voice-note.m4a";
  if (mimeType.includes("ogg")) return "voice-note.ogg";
  return "voice-note.webm";
}

/** What to tell the user when the microphone can't be used. Typed notes always still work. */
export function micErrorMessage(error: unknown): string {
  const name = error instanceof Error || (typeof error === "object" && error !== null && "name" in error) ? String((error as { name: string }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access is blocked for this site. Allow it from the lock icon next to the address, or type a note instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone was found on this computer. Type a note instead.";
    case "NotReadableError":
    case "AbortError":
      return "The microphone is busy in another app. Close it and try again, or type a note instead.";
    case "Unsupported":
      return "This browser can't record audio. Use a recent Chrome, Edge, Firefox or Safari, or type a note instead.";
    default:
      return "Couldn't start recording. Try again, or type a note instead.";
  }
}

/** Seconds left before the 2-minute cap, for the "0:15 left" warning near the end. */
export function secondsLeft(elapsedMs: number, maxMs = MAX_VOICE_NOTE_MS): number {
  return Math.max(0, Math.ceil((maxMs - elapsedMs) / 1000));
}
