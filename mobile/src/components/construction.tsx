import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { breakdownRows, constructionChoices, constructionLabel, type ConstructionBreakdown, type ConstructionList, type ConstructionRef } from '../lib/construction';
import { leadLabel } from '../lib/phone';
import { useSession } from '../session';
import { colors } from '../theme';
import { Button, ErrorBanner, Sheet } from './ui';

const ORANGE = { bg: '#FFF7ED', fg: '#9A3412', line: '#FDBA74' };

/** The lead's construction stage as a small badge beside its lead status ("Not known" muted). */
export function ConstructionBadge({ stage }: { stage: ConstructionRef | undefined }) {
  const known = Boolean(stage);
  return (
    <View style={[styles.badge, known ? { backgroundColor: ORANGE.bg } : styles.badgeMuted]} accessibilityLabel={`Construction stage: ${constructionLabel(stage)}`}>
      <Ionicons name="construct-outline" size={12} color={known ? ORANGE.fg : colors.ink3} />
      <Text style={[styles.badgeText, { color: known ? ORANGE.fg : colors.ink3 }]}>{constructionLabel(stage)}</Text>
    </View>
  );
}

/** Open leads per construction stage at a glance ("how many at Foundation / Roof"), beside the lead-status pipeline. */
export function ConstructionCard({ data, title = 'By construction stage' }: { data: ConstructionBreakdown | null | undefined; title?: string }) {
  const rows = breakdownRows(data);
  if (rows.length === 0) return null;
  return (
    <View style={styles.card} testID="construction-breakdown">
      <View style={styles.cardHead}>
        <Ionicons name="construct-outline" size={18} color={ORANGE.fg} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View style={styles.chips}>
        {rows.map((r) => (
          <View key={r.key} style={[styles.chip, r.key === 'none' && styles.chipMuted]}>
            <Text style={[styles.chipText, r.key === 'none' && { color: colors.ink3 }]}>{r.label}</Text>
            <Text style={styles.chipCount}>{r.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Set the lead's construction stage: Not known, then the admin's stages (fetched live,
 * so new or renamed stages show without an app update). Never changes who has the lead.
 */
export function ConstructionSheet({
  lead,
  onClose,
  onDone,
}: {
  lead: { id: string; name: string | null; phone: string; constructionStage?: ConstructionRef };
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const { api } = useSession();
  const currentId = lead.constructionStage?.id ?? null;
  const [choices, setChoices] = useState<{ id: string | null; name: string; isActive: boolean }[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(currentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ConstructionList>('/construction-stages').then(
      (list) => setChoices(constructionChoices(list.stages, currentId)),
      (err) => setError(err instanceof Error ? err.message : 'Could not load the construction stages.'),
    );
  }, [api, currentId]);

  const target = choices?.find((c) => c.id === chosen) ?? null;
  const unchanged = chosen === currentId;

  async function save() {
    if (!target || unchanged) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/leads/${lead.id}`, { method: 'PATCH', body: { constructionStageId: target.id } });
      onDone(target.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the construction stage.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Construction stage: ${leadLabel(lead)}`} onClose={onClose}>
      <Text style={styles.hint}>{"Where the customer's building is. Ask them, and set it here instead of in the notes."}</Text>
      {!choices && !error && <Text style={styles.hint}>Loading…</Text>}
      {choices?.map((c) => {
        const on = chosen === c.id;
        return (
          <Pressable
            key={c.id ?? 'none'}
            testID={`construction-${c.name}`}
            onPress={() => setChosen(c.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.row, on && { borderColor: ORANGE.fg, backgroundColor: ORANGE.bg }]}
          >
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? ORANGE.fg : colors.ink3} />
            <Text style={[styles.name, c.id === null && { color: colors.ink2 }]}>{c.name}</Text>
            {c.id === currentId && <Text style={styles.current}>now</Text>}
          </Pressable>
        );
      })}
      <ErrorBanner message={error} />
      <View style={styles.gap}>
        <Button testID="save-construction" label="Save construction stage" icon="construct-outline" onPress={save} disabled={!target || unchanged} busy={busy} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeMuted: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  badgeText: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, marginHorizontal: 12, marginTop: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: ORANGE.line, backgroundColor: ORANGE.bg, paddingHorizontal: 10, paddingVertical: 6 },
  chipMuted: { borderColor: colors.lineStrong, backgroundColor: colors.surface, borderStyle: 'dashed' },
  chipText: { fontSize: 14, color: ORANGE.fg, fontWeight: '600' },
  chipCount: { fontSize: 14, fontWeight: '800', color: colors.ink },
  hint: { fontSize: 14, color: colors.ink3, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, marginBottom: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  current: { fontSize: 12, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase' },
  gap: { marginTop: 12 },
});
