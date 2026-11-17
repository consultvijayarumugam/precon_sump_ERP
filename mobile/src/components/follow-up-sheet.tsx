import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FOLLOW_UP_OUTCOME_LABELS, FOLLOW_UP_OUTCOMES, type FollowUpOutcome } from '../lib/followups';
import { formatDateTime } from '../lib/workflow';
import { useSession } from '../session';
import { colors } from '../theme';
import { CallbackPicker } from './callback-picker';
import { Button, Chip, ErrorBanner, FieldLabel, inputStyle, Sheet } from './ui';

/**
 * One pending follow-up: mark it done with what happened, or move it, as on the
 * web Follow-ups page (POST /follow-ups/:id/complete, PATCH /follow-ups/:id).
 */
export function FollowUpSheet({
  followUp,
  leadName,
  noun = 'follow-up',
  onClose,
  onDone,
}: {
  followUp: { id: string; scheduledAt: string; note: string | null };
  leadName: string;
  noun?: 'callback' | 'follow-up';
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { api } = useSession();
  const [mode, setMode] = useState<'done' | 'move'>('done');
  const [outcome, setOutcome] = useState<FollowUpOutcome | null>(null);
  const [note, setNote] = useState(followUp.note ?? '');
  const [moveTo, setMoveTo] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'done') {
        await api(`/follow-ups/${followUp.id}/complete`, { method: 'POST', body: { outcome, note: note.trim() || undefined } });
        onDone(`${leadName}: marked done`);
      } else {
        await api(`/follow-ups/${followUp.id}`, { method: 'PATCH', body: { scheduledAt: moveTo!.toISOString(), note: note.trim() || undefined } });
        onDone(`${leadName}: moved to ${formatDateTime(moveTo!)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setBusy(false);
    }
  }

  const ready = mode === 'done' ? outcome !== null : moveTo !== null;
  return (
    <Sheet
      title={`${leadName}: ${noun} ${formatDateTime(followUp.scheduledAt)}`}
      onClose={onClose}
      footer={
        <>
          <ErrorBanner message={error} />
          <Button testID="save-follow-up" label={mode === 'done' ? 'Mark done' : `Move ${noun}`} onPress={save} disabled={!ready} busy={busy} style={styles.gap} />
        </>
      }
    >
      <View style={styles.modes}>
        <Chip testID="mode-done" label="Done" active={mode === 'done'} onPress={() => setMode('done')} tone="good" />
        <Chip testID="mode-move" label="Move to another time" active={mode === 'move'} onPress={() => setMode('move')} />
      </View>
      {mode === 'done' ? (
        <>
          <FieldLabel>What happened?</FieldLabel>
          <View style={styles.grid}>
            {FOLLOW_UP_OUTCOMES.map((o) => (
              <Chip key={o} testID={`fu-outcome-${o}`} label={FOLLOW_UP_OUTCOME_LABELS[o]} active={outcome === o} onPress={() => setOutcome(o)} tone={o === 'NOT_INTERESTED' ? 'danger' : undefined} />
            ))}
          </View>
          {outcome === 'NOT_INTERESTED' && <Text style={styles.warn}>This closes the follow-up, not the lead. To close the lead as Lost, log the call as Not interested or move its stage to Lost.</Text>}
        </>
      ) : (
        <>
          <FieldLabel>{`New ${noun} time`}</FieldLabel>
          <CallbackPicker value={moveTo} onChange={setMoveTo} noun={noun} />
        </>
      )}
      <FieldLabel>Note (optional)</FieldLabel>
      <TextInput testID="fu-note" style={inputStyle} value={note} onChangeText={setNote} placeholder="What was discussed?" placeholderTextColor={colors.ink3} maxLength={1000} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  warn: { fontSize: 13, color: colors.amber, marginTop: 8 },
  gap: { marginTop: 10 },
});
