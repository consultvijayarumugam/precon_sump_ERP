/**
 * What a voice note may be. Like the file library, the type is decided from the
 * file's first bytes, not its name or the browser's claim.
 *
 *   phone app  -> AAC in an .m4a (MP4) container
 *   web        -> Opus in WebM (Chrome, Edge, Firefox) or AAC in MP4 (Safari)
 *
 * 3GP/AMR (Android's "low quality" default) is refused: browsers can't play it.
 */
export const MAX_VOICE_NOTE_MS = 120_000; // 2 minutes
/** Recorders stop a little late; anything up to this is accepted as "2 minutes". */
export const VOICE_NOTE_GRACE_MS = 5_000;
export const MIN_VOICE_NOTE_MS = 500;
/** 2 minutes at 32-64 kbps is 0.5-1 MB; this leaves room without letting huge files in. */
export const MAX_VOICE_NOTE_BYTES = 3 * 1024 * 1024;

export interface AudioType {
  mimeType: string;
  ext: string;
}

const ascii = (head: Buffer, from: number, to: number) => head.subarray(from, to).toString('latin1');

/** The audio type these bytes really are, or null. */
export function detectAudio(data: Buffer): AudioType | null {
  const head = data.subarray(0, 16);
  if (head.length < 12) return null;
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { mimeType: 'audio/webm', ext: 'webm' };
  if (ascii(head, 0, 4) === 'OggS') return { mimeType: 'audio/ogg', ext: 'ogg' };
  if (ascii(head, 4, 8) === 'ftyp') {
    // 3GP (usually AMR audio) plays on phones but not in browsers.
    if (ascii(head, 8, 11) === '3gp' || ascii(head, 8, 11) === '3g2') return null;
    return { mimeType: 'audio/mp4', ext: 'm4a' };
  }
  return null;
}

/** "1:05" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Why this recording can't be saved, or null. */
export function voiceNoteProblem(file: { buffer?: Buffer; size: number } | undefined, durationMs: number): string | null {
  if (!file?.buffer?.length) return 'No recording was received. Record the note again.';
  if (file.size > MAX_VOICE_NOTE_BYTES) return 'That recording is too large (over 3 MB). Keep voice notes under 2 minutes.';
  if (!Number.isFinite(durationMs) || durationMs < MIN_VOICE_NOTE_MS) return 'That recording is too short. Hold on a moment longer and record again.';
  if (durationMs > MAX_VOICE_NOTE_MS + VOICE_NOTE_GRACE_MS) return 'Voice notes can be up to 2 minutes long.';
  if (!detectAudio(file.buffer)) return "That isn't a supported recording (M4A, WebM or Ogg audio).";
  return null;
}
