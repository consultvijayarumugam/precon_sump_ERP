// Voice notes on a lead (GET/POST /leads/:id/voice-notes), as on the web lead page.
// Pure helpers; the recorder and player live in components/voice-notes.tsx.

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
/** Shorter than this is almost always an accidental tap. */
export const MIN_VOICE_NOTE_MS = 500;

/** "1:05" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Seconds left before the 2-minute cap, for the warning near the end. */
export function secondsLeft(elapsedMs: number): number {
  return Math.max(0, Math.ceil((MAX_VOICE_NOTE_MS - elapsedMs) / 1000));
}

/** The microphone permission as the app needs to act on it. */
export type MicPermission = { granted: boolean; canAskAgain: boolean };

/**
 * What tapping "Record voice note" should do:
 *   record   - already allowed
 *   explain  - say why first, then show Android's prompt
 *   blocked  - Android won't ask again; only Settings can change it (offer typed notes)
 */
export function micNextStep(permission: MicPermission | null): 'record' | 'explain' | 'blocked' {
  if (!permission) return 'explain'; // couldn't check: asking is harmless
  if (permission.granted) return 'record';
  return permission.canAskAgain ? 'explain' : 'blocked';
}

/** Why a finished recording can't be saved (null = fine). */
export function recordingProblem(durationMs: number, uri: string | null): string | null {
  if (!uri) return "The recording didn't save on this phone. Try again, or add a typed note.";
  if (durationMs < MIN_VOICE_NOTE_MS) return 'That was too short to keep. Tap Record, speak, then Stop.';
  return null;
}

/** "Tara Telecaller · 24 Nov, 2:15 pm"-style label is built by the screen; this is the screen-reader text. */
export function playLabel(note: Pick<VoiceNote, 'durationMs'>, who: string, playing: boolean): string {
  return `${playing ? 'Pause' : 'Play'} voice note from ${who}, ${formatDuration(note.durationMs)} long`;
}
