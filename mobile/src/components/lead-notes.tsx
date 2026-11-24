import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';
import { noteError, sharedWith, type LeadNote } from '../lib/notes';
import { formatDateTime, type LeadDetail } from '../lib/workflow';
import { useSession, useUser } from '../session';
import { colors, space } from '../theme';
import { useResource } from '../use-resource';
import { Button, ErrorBanner, inputStyle, Sheet } from './ui';
import { VoiceNotes } from './voice-notes';

/** Write a new note, or change one of your own. */
function NoteSheet({ leadId, note, onClose, onDone }: { leadId: string; note: LeadNote | null; onClose: () => void; onDone: () => void }) {
  const { api } = useSession();
  const [text, setText] = useState(note?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = noteError(text);

  async function save() {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      if (note) await api(`/leads/${leadId}/notes/${note.id}`, { method: 'PATCH', body: { body: text.trim() } });
      else await api(`/leads/${leadId}/notes`, { method: 'POST', body: { body: text.trim() } });
      ToastAndroid.show(note ? 'Note saved' : 'Note added. The team can see it.', ToastAndroid.SHORT);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note.');
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={note ? 'Edit your note' : 'Add a shared note'}
      onClose={onClose}
      footer={
        <>
          <ErrorBanner message={error} />
          <Button testID="save-note" label={note ? 'Save note' : 'Add note'} icon="chatbubbles-outline" onPress={save} disabled={!!problem} busy={busy} style={styles.gap} />
        </>
      }
    >
      <TextInput
        testID="note-text"
        style={[inputStyle, styles.input]}
        value={text}
        onChangeText={setText}
        placeholder="What the customer said, when to call, what to quote…"
        placeholderTextColor={colors.ink3}
        multiline
        maxLength={2000}
        autoFocus
      />
      <Text style={styles.hint}>The telecaller and salesperson on this lead, and admins, all see it.</Text>
    </Sheet>
  );
}

/**
 * Shared notes on the lead page: the telecaller who worked the lead and its
 * salesperson see each other's notes (and admins see all), so they can
 * coordinate. Authors edit their own; the others get a notification.
 */
export function SharedNotes({ lead }: { lead: LeadDetail }) {
  const { user, can } = useUser();
  const notes = useResource<LeadNote[]>(`/leads/${lead.id}/notes`);
  const [open, setOpen] = useState<{ note: LeadNote | null } | null>(null);
  const canWrite = can('leads.write') || can('leads.qualify');
  const count = (notes.data?.length ?? 0) + (lead.notes ? 1 : 0);

  return (
    <View testID="shared-notes">
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Shared notes{count ? ` · ${count}` : ''}</Text>
        {canWrite && (
          <Pressable testID="add-note" onPress={() => setOpen({ note: null })} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Add a shared note">
            <Ionicons name="add-circle-outline" size={20} color={colors.blue} />
            <Text style={styles.addText}>Add note</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.shared}>{sharedWith(lead)}</Text>
      <ErrorBanner message={notes.error} />
      <View style={styles.card}>
        {lead.notes ? (
          <View style={styles.note}>
            <Text style={styles.author}>Added with the lead</Text>
            <Text style={styles.body}>{lead.notes}</Text>
            <Text style={styles.meta}>{formatDateTime(lead.createdAt)}</Text>
          </View>
        ) : null}
        {notes.data?.map((n) => {
          const mine = n.author.id === user.id;
          return (
            <Pressable
              key={n.id}
              testID={`note-${n.id}`}
              disabled={!mine || !canWrite}
              onPress={() => setOpen({ note: n })}
              style={({ pressed }) => [styles.note, mine && styles.mine, pressed && styles.pressed]}
              accessibilityRole={mine ? 'button' : undefined}
              accessibilityHint={mine ? 'Edit your note' : undefined}
            >
              <View style={styles.authorRow}>
                <Text style={styles.author}>
                  {mine ? 'You' : n.author.fullName}
                  <Text style={styles.role}> · {n.author.role.name}</Text>
                </Text>
                {mine && canWrite && <Ionicons name="create-outline" size={16} color={colors.blue} />}
              </View>
              <Text style={styles.body}>{n.body}</Text>
              <Text style={styles.meta}>
                {formatDateTime(n.createdAt)}
                {n.editedAt ? ' · edited' : ''}
              </Text>
            </Pressable>
          );
        })}
        {notes.data && notes.data.length === 0 && !lead.notes && <Text style={styles.none}>No notes yet.{canWrite ? ' Add one for the team.' : ''}</Text>}
        {!notes.data && !notes.error && <Text style={styles.none}>Loading…</Text>}
      </View>
      {/* Voice notes sit with the typed ones; a refused microphone falls back to a typed note. */}
      <VoiceNotes leadId={lead.id} canRecord={canWrite} onTypeNote={() => setOpen({ note: null })} />
      {open && (
        <NoteSheet
          leadId={lead.id}
          note={open.note}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            notes.reload();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 10 },
  input: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  hint: { fontSize: 13, color: colors.ink3, marginTop: 8 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  heading: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.ink2 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: space.tap, paddingHorizontal: 8 },
  addText: { fontSize: 15, fontWeight: '700', color: colors.blue },
  shared: { fontSize: 13, color: colors.ink3, marginBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  note: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  mine: { backgroundColor: '#F7FAFF' },
  pressed: { opacity: 0.8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  author: { fontSize: 14, fontWeight: '700', color: colors.ink },
  role: { fontWeight: '400', color: colors.ink3 },
  body: { fontSize: 15, color: colors.ink, marginTop: 3, lineHeight: 21 },
  meta: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  none: { fontSize: 14, color: colors.ink3, padding: 14 },
});
