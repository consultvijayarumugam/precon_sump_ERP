import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { salesStages, type PipelineStage } from '../lib/sales';
import { useSession } from '../session';
import { colors } from '../theme';
import { Button, ErrorBanner, Sheet } from './ui';

const KIND_COLOR: Partial<Record<PipelineStage['kind'], string>> = { WON: colors.green, LOST: colors.red };

/** Move a lead along the sales pipeline (admin-defined stages), to Won, or to Lost. Same as the web lead page. */
export function StageSheet({ lead, onClose, onDone }: { lead: { id: string; name: string; stage: { id: string } | null }; onClose: () => void; onDone: (stage: PipelineStage) => void }) {
  const { api } = useSession();
  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(lead.stage?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PipelineStage[]>('/pipeline-stages').then(
      (all) => setStages(salesStages(all, lead.stage?.id ?? null)),
      (err) => setError(err instanceof Error ? err.message : 'Could not load the stages.'),
    );
  }, [api, lead.stage?.id]);

  const target = stages?.find((s) => s.id === chosen) ?? null;
  const unchanged = chosen === (lead.stage?.id ?? null);

  async function save() {
    if (!target || unchanged) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/leads/${lead.id}`, { method: 'PATCH', body: { stageId: target.id } });
      onDone(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the stage.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Move ${lead.name} to…`} onClose={onClose}>
      {!stages && !error && <Text style={styles.none}>Loading stages…</Text>}
      {stages?.map((s) => {
        const on = chosen === s.id;
        const tint = KIND_COLOR[s.kind] ?? colors.blue;
        return (
          <Pressable
            key={s.id}
            testID={`stage-${s.name}`}
            onPress={() => setChosen(s.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.row, on && { borderColor: tint, backgroundColor: colors.tint }]}
          >
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? tint : colors.ink3} />
            <Text style={[styles.name, KIND_COLOR[s.kind] && { color: tint }]}>{s.name}</Text>
            {s.id === lead.stage?.id && <Text style={styles.current}>now</Text>}
          </Pressable>
        );
      })}
      {target?.kind === 'WON' && !unchanged && <Text style={styles.won}>Marks the deal as won. It moves to your Won list.</Text>}
      {target?.kind === 'LOST' && !unchanged && <Text style={styles.lost}>Closes the lead as Lost; it leaves your list.</Text>}
      <ErrorBanner message={error} />
      <View style={styles.gap}>
        <Button testID="save-stage" label={target?.kind === 'WON' ? 'Mark as won' : 'Save stage'} onPress={save} disabled={!target || unchanged} busy={busy} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  none: { fontSize: 14, color: colors.ink3, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, marginBottom: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  current: { fontSize: 12, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase' },
  won: { fontSize: 14, color: colors.green, fontWeight: '600', marginTop: 4 },
  lost: { fontSize: 14, color: colors.red, fontWeight: '600', marginTop: 4 },
  gap: { marginTop: 12 },
});
