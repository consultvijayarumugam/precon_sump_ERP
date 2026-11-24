import { Ionicons } from '@expo/vector-icons';
import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioSource,
  type RecordingOptions,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { formatDateTime } from '../lib/workflow';
import {
  formatDuration,
  MAX_VOICE_NOTE_MS,
  micNextStep,
  playLabel,
  recordingProblem,
  secondsLeft,
  type MicPermission,
  type VoiceNote,
} from '../lib/voice-notes';
import { useSession, useUser } from '../session';
import { colors, space } from '../theme';
import { useResource } from '../use-resource';
import { Button, ErrorBanner, Sheet } from './ui';

/**
 * Speech quality, small files: AAC in .m4a, mono, 22 kHz, 32 kbps, about
 * 0.5 MB for 2 minutes. M4A plays in every browser and on the phone (Android's
 * default 3GP/AMR doesn't play in browsers).
 */
const VOICE_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { extension: '.m4a', outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

async function micPermission(): Promise<MicPermission | null> {
  try {
    const p = await getRecordingPermissionsAsync();
    return { granted: p.granted, canAskAgain: p.canAskAgain };
  } catch {
    return null;
  }
}

/**
 * Play/pause with elapsed and total. Nothing is downloaded until Play is
 * tapped; the request carries the login token (voice notes are never public).
 */
function Player({ source, durationMs, label, testID }: { source: () => AudioSource; durationMs: number; label: (playing: boolean) => string; testID?: string }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // At the end, go back to the start so the next tap plays it again.
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => undefined);
    }
  }, [status.didJustFinish, player]);

  function toggle() {
    setError(null);
    try {
      if (status.playing) return player.pause();
      if (!loaded) {
        player.replace(source());
        setLoaded(true);
      }
      player.play();
    } catch {
      setError("Couldn't play this recording.");
    }
  }

  const positionMs = Math.min(status.currentTime * 1000, durationMs);
  const pct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;
  const waiting = loaded && status.isBuffering && !status.playing;
  return (
    <View style={styles.player}>
      <Pressable
        testID={testID}
        onPress={toggle}
        style={({ pressed }) => [styles.play, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label(status.playing)}
        hitSlop={6}
      >
        {waiting ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name={status.playing ? 'pause' : 'play'} size={22} color="#FFFFFF" />}
      </Pressable>
      <View style={styles.trackWrap}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.time}>
          {formatDuration(positionMs)} / {formatDuration(durationMs)}
        </Text>
        <ErrorBanner message={error} />
      </View>
    </View>
  );
}

type Step = { kind: 'idle' } | { kind: 'recording' } | { kind: 'review'; uri: string; durationMs: number };
type Ask = 'explain' | 'blocked' | 'refused' | null;

/**
 * "Record voice note": asks for the microphone with a short explanation first,
 * records up to 2 minutes with a clear indicator, then lets you listen back and
 * Save or Discard. A refused microphone never crashes anything; it offers a typed note.
 */
function Recorder({ leadId, onSaved, onTypeNote }: { leadId: string; onSaved: () => void; onTypeNote: () => void }) {
  const { api } = useSession();
  const recorder = useAudioRecorder(VOICE_OPTIONS);
  const state = useAudioRecorderState(recorder, 250);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [ask, setAsk] = useState<Ask>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The last length seen while recording (the recorder may report 0 once stopped), and a guard
  // so Stop and the 2-minute cap can't both finish the same recording.
  const lastMs = useRef(0);
  const stopping = useRef(false);

  useEffect(() => {
    if (state.isRecording) lastMs.current = state.durationMillis;
  }, [state.isRecording, state.durationMillis]);

  // Leaving the lead mid-recording releases the microphone.
  useEffect(
    () => () => {
      if (recorder.isRecording) recorder.stop().catch(() => undefined);
      setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    },
    [recorder],
  );

  async function begin() {
    setError(null);
    setBusy(true);
    lastMs.current = 0;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_VOICE_NOTE_MS / 1000 });
      setStep({ kind: 'recording' });
    } catch {
      setError("Couldn't start recording. Check no other app is using the microphone, or add a typed note.");
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function onRecordPress() {
    const next = micNextStep(await micPermission());
    if (next === 'record') return begin();
    setAsk(next);
  }

  async function allow() {
    try {
      const result = await requestRecordingPermissionsAsync();
      if (result.granted) {
        setAsk(null);
        return begin();
      }
      setAsk(result.canAskAgain ? 'refused' : 'blocked');
    } catch {
      setAsk('refused');
    }
  }

  async function stop() {
    if (stopping.current) return;
    stopping.current = true;
    const durationMs = Math.min(Math.max(lastMs.current, state.durationMillis), MAX_VOICE_NOTE_MS);
    try {
      await recorder.stop();
    } catch {
      // already stopped (the 2-minute cap)
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    const problem = recordingProblem(durationMs, recorder.uri);
    if (problem) {
      setError(problem);
      setStep({ kind: 'idle' });
    } else {
      setStep({ kind: 'review', uri: recorder.uri!, durationMs });
    }
    stopping.current = false;
  }

  // The recorder stops itself at 2 minutes (or if the system interrupts it); move on to review.
  useEffect(() => {
    if (step.kind === 'recording' && !state.isRecording && lastMs.current > 0) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRecording, step.kind]);

  async function save() {
    if (step.kind !== 'review') return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('durationMs', String(Math.round(step.durationMs)));
      form.append('audio', { uri: step.uri, name: 'voice-note.m4a', type: 'audio/mp4' } as unknown as Blob);
      await api(`/leads/${leadId}/voice-notes`, { method: 'POST', body: form, timeoutMs: 60_000 });
      ToastAndroid.show('Voice note saved. The team can play it.', ToastAndroid.SHORT);
      setStep({ kind: 'idle' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the voice note. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const elapsed = state.durationMillis;
  return (
    <View style={styles.recorder}>
      {step.kind === 'idle' && (
        <Button testID="record-voice-note" label="Record voice note" icon="mic-outline" tone="secondary" onPress={onRecordPress} busy={busy} />
      )}
      {step.kind === 'recording' && (
        <View testID="recording" style={styles.recordingRow} accessibilityLiveRegion="polite">
          <View style={styles.redDot} />
          <View style={styles.recordingText}>
            <Text style={styles.recordingLabel}>Recording</Text>
            <Text style={styles.recordingTime}>
              {formatDuration(elapsed)} / {formatDuration(MAX_VOICE_NOTE_MS)}
              {secondsLeft(elapsed) <= 15 ? `  ·  ${secondsLeft(elapsed)}s left` : ''}
            </Text>
          </View>
          <Pressable testID="stop-recording" onPress={stop} style={({ pressed }) => [styles.stop, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Stop recording">
            <Ionicons name="stop" size={20} color="#FFFFFF" />
            <Text style={styles.stopText}>Stop</Text>
          </Pressable>
        </View>
      )}
      {step.kind === 'review' && (
        <View testID="review-recording">
          <Text style={styles.reviewText}>Listen back, then save it to the lead or discard it.</Text>
          <Player source={() => ({ uri: step.uri })} durationMs={step.durationMs} label={(p) => (p ? 'Pause your recording' : 'Play your recording')} testID="play-review" />
          <View style={styles.reviewButtons}>
            <Button testID="save-voice-note" label="Save" icon="checkmark" onPress={save} busy={busy} style={styles.flex} />
            <Button testID="discard-voice-note" label="Discard" icon="trash-outline" tone="secondary" onPress={() => setStep({ kind: 'idle' })} disabled={busy} style={styles.flex} />
          </View>
        </View>
      )}
      <ErrorBanner message={error} />

      {ask && (
        <Sheet
          title={ask === 'explain' ? 'Use the microphone?' : 'Microphone is off'}
          onClose={() => setAsk(null)}
          footer={
            ask === 'explain' ? (
              <>
                <Button testID="mic-allow" label="Continue" icon="mic-outline" onPress={allow} />
                <Button label="Not now" tone="secondary" onPress={() => setAsk(null)} style={styles.gap} />
              </>
            ) : (
              <>
                {ask === 'blocked' && (
                  <Button testID="mic-settings" label="Open settings" icon="settings-outline" onPress={() => { setAsk(null); Linking.openSettings().catch(() => undefined); }} />
                )}
                {ask === 'refused' && <Button label="Try again" icon="mic-outline" onPress={allow} />}
                <Button
                  testID="type-note-instead"
                  label="Type a note instead"
                  icon="create-outline"
                  tone="secondary"
                  onPress={() => {
                    setAsk(null);
                    onTypeNote();
                  }}
                  style={styles.gap}
                />
              </>
            )
          }
        >
          <Text style={styles.askText}>
            {ask === 'explain'
              ? 'Precon Sump uses the microphone only while you record a voice note on this lead. The recording is shared with the people on the lead and admins. Android will ask you next.'
              : ask === 'blocked'
                ? "Microphone access is turned off for Precon Sump, so Android won't ask again. Turn it on in Settings → Permissions → Microphone, or type a note instead."
                : "Without the microphone you can't record. You can still type a note for the team."}
          </Text>
        </Sheet>
      )}
    </View>
  );
}

/** The lead's voice notes: play them (everyone on the lead) and record new ones (those who can note). */
export function VoiceNotes({ leadId, canRecord, onTypeNote }: { leadId: string; canRecord: boolean; onTypeNote: () => void }) {
  const { user, apiUrl } = useUser();
  const { authHeaders } = useSession();
  const notes = useResource<VoiceNote[]>(`/leads/${leadId}/voice-notes`);
  const count = notes.data?.length ?? 0;

  return (
    <View testID="voice-notes">
      <Text style={styles.heading}>Voice notes{count ? ` · ${count}` : ''}</Text>
      <ErrorBanner message={notes.error} />
      <View style={styles.card}>
        {notes.data?.map((n) => {
          const who = n.author.id === user.id ? 'You' : n.author.fullName;
          return (
            <View key={n.id} testID={`voice-note-${n.id}`} style={styles.item}>
              <Text style={styles.author}>
                {who}
                <Text style={styles.role}> · {n.author.role.name}</Text>
              </Text>
              <Text style={styles.meta}>{formatDateTime(n.createdAt)}</Text>
              <Player
                source={() => ({ uri: `${apiUrl}/leads/${leadId}/voice-notes/${n.id}/audio`, headers: authHeaders() })}
                durationMs={n.durationMs}
                label={(playing) => playLabel(n, who, playing)}
                testID={`play-${n.id}`}
              />
            </View>
          );
        })}
        {notes.data && notes.data.length === 0 && <Text style={styles.none}>No voice notes yet.</Text>}
        {!notes.data && !notes.error && <Text style={styles.none}>Loading…</Text>}
        {canRecord && <Recorder leadId={leadId} onSaved={notes.reload} onTypeNote={onTypeNote} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.ink2, marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  item: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  author: { fontSize: 14, fontWeight: '700', color: colors.ink },
  role: { fontWeight: '400', color: colors.ink3 },
  meta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  none: { fontSize: 14, color: colors.ink3, padding: 14 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  play: { width: space.tap, height: space.tap, borderRadius: space.tap / 2, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  trackWrap: { flex: 1 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.blue },
  time: { fontSize: 12, color: colors.ink3, marginTop: 4, fontVariant: ['tabular-nums'] },
  recorder: { padding: 14 },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: space.tap },
  redDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#DC2626' },
  recordingText: { flex: 1 },
  recordingLabel: { fontSize: 15, fontWeight: '700', color: colors.red },
  recordingTime: { fontSize: 14, color: colors.ink, fontVariant: ['tabular-nums'] },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: space.tap, paddingHorizontal: 16, borderRadius: space.radius, backgroundColor: colors.red },
  stopText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  reviewText: { fontSize: 14, color: colors.ink2 },
  reviewButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  flex: { flex: 1 },
  gap: { marginTop: 10 },
  askText: { fontSize: 15, lineHeight: 22, color: colors.ink },
});
