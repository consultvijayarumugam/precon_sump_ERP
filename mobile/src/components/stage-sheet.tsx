import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PipelineStage } from '../lib/sales';
import { groupedChoices, moveEffect, stageChoices, stageRole } from '../lib/stages';
import { useSession, useUser } from '../session';
import { colors } from '../theme';
import { Button, ErrorBanner, Sheet } from './ui';
import { leadLabel } from '../lib/phone';

const KIND_COLOR: Partial<Record<PipelineStage['kind'], string>> = { WON: colors.green, LOST: colors.red };

export interface StageMoveResult {
  movedOutOfScope?: boolean;
  assignedTo?: { id: string; fullName: string } | null;
}

type SheetLead = {
  id: string;
  name: string | null;
  phone: string;
  stage: { id: string } | null;
  assignedTo: { id: string; fullName: string } | null;
  telecaller?: { id: string } | null;
  qualifiedAt?: string | null;
};

/**
 * Move a lead to any active pipeline stage (admin-defined, fetched live), grouped
 * by side. Crossing the handover changes who has the lead; the sheet says so first.
 */
export function StageSheet({ lead, onClose, onDone }: { lead: SheetLead; onClose: () => void; onDone: (stage: PipelineStage, result: StageMoveResult) => void }) {
  const { api } = useSession();
  const { can, user } = useUser();
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
  // A guess at who has it, for the note (the server decides for certain).
  const ownerIsSales = lead.assignedTo?.id === user.id ? can('leads.receive_qualified') : Boolean(lead.qualifiedAt && lead.assignedTo?.id !== lead.telecaller?.id);
  const effect = target ? moveEffect(target, { ownerIsSales, handedOver: Boolean(lead.qualifiedAt) }) : 'none';

  async function save() {
    if (!target || unchanged) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<StageMoveResult>(`/leads/${lead.id}`, { method: 'PATCH', body: { stageId: target.id } });
      onDone(target, result ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the stage.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Move ${leadLabel(lead)} to…`} onClose={onClose}>
      {!stages && !error && <Text style={styles.none}>Loading stages…</Text>}
      {stages &&
        groupedChoices(stages).map((group) => (
          <View key={group.side}>
            <Text style={styles.group}>{group.label}</Text>
            {group.stages.map((s) => {
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
          </View>
        ))}
      {target && !unchanged && effect === 'handover' && (
        <Text testID="stage-handover-note" style={styles.note}>
          This hands the lead to sales: the next salesperson in turn gets it, and it leaves the telecaller's worklist.
        </Text>
      )}
      {target && !unchanged && effect === 'return' && (
        <Text testID="stage-return-note" style={styles.note}>
          This sends the lead back to the telecaller who worked it (or the next one in turn); it leaves your list.
        </Text>
      )}
      {target?.kind === 'WON' && !unchanged && <Text style={styles.won}>Marks the deal as won. It moves to the Won list.</Text>}
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
  group: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.ink3, marginTop: 10, marginBottom: 6 },
  note: { fontSize: 14, color: colors.amber, fontWeight: '600', marginTop: 4 },
});
