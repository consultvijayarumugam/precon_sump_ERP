import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PipelineStage } from '../lib/sales';
import { stageChoices, stageRole } from '../lib/stages';
import { useSession, useUser } from '../session';
import { colors } from '../theme';
import { Button, ErrorBanner, Sheet } from './ui';
import { leadLabel } from '../lib/phone';

const KIND_COLOR: Partial<Record<PipelineStage['kind'], string>> = { WON: colors.green, LOST: colors.red };

type SheetLead = { id: string; name: string | null; phone: string; stage: { id: string } | null };

/**
 * Set the lead's stage: one flat list of every active stage (admin-defined, fetched
 * live). The stage is only where the conversation is; it never changes who has the
 * lead (that's "Qualify & hand over", or an admin's Reassign).
 */
export function StageSheet({ lead, onClose, onDone }: { lead: SheetLead; onClose: () => void; onDone: (stage: PipelineStage) => void }) {
  const { api } = useSession();
  const { can } = useUser();
  const role = stageRole(can);
  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(lead.stage?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PipelineStage[]>('/pipeline-stages').then(
      // Fetched live every time, so stages the admin adds or renames show without an app update.
      (all) => setStages(stageChoices(all, role, lead.stage?.id ?? null)),
      (err) => setError(err instanceof Error ? err.message : 'Could not load the stages.'),
    );
  }, [api, lead.stage?.id, role]);

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
    <Sheet title={`Move ${leadLabel(lead)} to…`} onClose={onClose}>
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
      {target?.kind === 'WON' && !unchanged && <Text style={styles.won}>Marks the deal as won. It moves to the Won list.</Text>}
      {target?.kind === 'LOST' && !unchanged && <Text style={styles.lost}>Closes the lead as Lost; it leaves your worklist.</Text>}
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
