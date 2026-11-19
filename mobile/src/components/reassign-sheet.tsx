import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../session';
import { colors, space } from '../theme';
import { useResource } from '../use-resource';
import { Button, ErrorBanner, Sheet } from './ui';

interface SalesTeam {
  members: { id: string; fullName: string; inRotation: boolean }[];
}

/**
 * Admin only (leads.assign): hand a handed-over lead to a different
 * salesperson, as on the web. The old one loses it, the new one is notified,
 * and the change history records who did it, from whom and to whom.
 */
export function ReassignSheet({ lead, onClose, onDone }: { lead: { id: string; name: string; assignedTo: { id: string; fullName: string } | null }; onClose: () => void; onDone: (to: string) => void }) {
  const { api } = useSession();
  const team = useResource<SalesTeam>('/sales-team');
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = team.data?.members.filter((m) => m.id !== lead.assignedTo?.id) ?? [];

  async function save() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ salesperson: { fullName: string } }>(`/leads/${lead.id}/salesperson`, { method: 'PUT', body: { salesUserId: chosen } });
      onDone(result.salesperson.fullName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reassign the lead.');
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`Reassign ${lead.name}`}
      onClose={onClose}
      footer={
        <>
          <ErrorBanner message={error ?? team.error} />
          <Button testID="save-reassign" label="Reassign" icon="swap-horizontal" onPress={save} disabled={!chosen} busy={busy} style={styles.gap} />
        </>
      }
    >
      <Text style={styles.now}>Now with {lead.assignedTo?.fullName ?? 'nobody'}. Pick the new salesperson:</Text>
      {!team.data && !team.error && <Text style={styles.now}>Loading…</Text>}
      {team.data && others.length === 0 && <Text style={styles.now}>There's no other salesperson to hand it to.</Text>}
      {others.map((m) => {
        const on = chosen === m.id;
        return (
          <Pressable
            key={m.id}
            testID={`to-${m.fullName}`}
            onPress={() => setChosen(m.id)}
            style={[styles.option, on && styles.optionOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.blue : colors.ink3} />
            <View style={styles.flex}>
              <Text style={styles.name}>{m.fullName}</Text>
              {!m.inRotation && <Text style={styles.hint}>Not taking new leads right now</Text>}
            </View>
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { marginTop: 10 },
  now: { fontSize: 14, color: colors.ink2, marginBottom: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: space.tapLarge, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, marginBottom: 8 },
  optionOn: { borderColor: colors.blue, backgroundColor: colors.tint },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink },
  hint: { fontSize: 13, color: colors.ink3 },
});
