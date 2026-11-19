import { Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DateRangeBar } from '../components/date-range-bar';
import { Centered, Chip, ErrorBanner } from '../components/ui';
import { formatCell, type ReportData, type ReportInfo } from '../lib/admin';
import { DASHBOARD_PRESETS, presetRange, type DateRange } from '../lib/date-range';
import { colors } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';

/**
 * The web Reports page for the phone: pick a report and a date range; each
 * row reads as a card. Admins see everyone, others their own rows (the server
 * decides). Downloads (CSV / Excel) stay on the web.
 */
export function ReportsScreen() {
  const pad = useBottomPad();
  const list = useResource<ReportInfo[]>('/reports');
  const [key, setKey] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => presetRange('month'));
  const chosen = key ?? list.data?.[0]?.key ?? null;
  const report = useResource<ReportData>(chosen ? `/reports/${chosen}?from=${range.from}&to=${range.to}` : null);
  const r = report.data && report.data.key === chosen ? report.data : null;
  const [first, ...rest] = r?.columns ?? [];

  return (
    <ScrollView style={styles.page} refreshControl={<RefreshControl refreshing={report.refreshing} onRefresh={report.refresh} colors={[colors.blue]} />} contentContainerStyle={{ paddingBottom: pad }}>
      <Stack.Screen options={{ title: 'Reports' }} />
      <ErrorBanner message={list.error} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {list.data?.map((x) => (
          <Chip key={x.key} testID={`report-${x.key}`} label={x.title} active={chosen === x.key} onPress={() => setKey(x.key)} />
        ))}
      </ScrollView>
      <DateRangeBar value={range} onChange={setRange} presets={DASHBOARD_PRESETS} testID="report-dates" />
      {r && (
        <Text style={styles.description}>
          {r.description}
          {r.scope === 'own' ? ' Only rows about you.' : ''}
        </Text>
      )}
      <ErrorBanner message={report.error} />
      {chosen && !r && !report.error && <Centered />}
      {r && r.rows.length === 0 && <Text style={styles.none}>Nothing in these dates.</Text>}
      {r &&
        [...r.rows, ...(r.totals ? [r.totals] : [])].map((row, i) => {
          const total = r.totals && i === r.rows.length;
          return (
            <View key={i} style={[styles.card, total && styles.totalCard]}>
              {first && <Text style={styles.cardTitle}>{total ? 'Total' : formatCell(first.kind, row[first.key])}</Text>}
              {rest.map((c) => (
                <View key={c.key} style={styles.line}>
                  <Text style={styles.label}>{c.label}</Text>
                  <Text style={styles.value}>{formatCell(c.kind, row[c.key])}</Text>
                </View>
              ))}
            </View>
          );
        })}
      {r && <Text style={styles.note}>Download CSV or Excel from Reports on the web.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  chips: { gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  description: { fontSize: 13, color: colors.ink3, marginHorizontal: 16, marginTop: 10 },
  none: { fontSize: 15, color: colors.ink2, textAlign: 'center', marginTop: 32 },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14, marginHorizontal: 12, marginTop: 10 },
  totalCard: { borderColor: colors.blue, backgroundColor: colors.tint },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  label: { flex: 1, fontSize: 14, color: colors.ink2 },
  value: { fontSize: 14, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  note: { fontSize: 12, color: colors.ink3, textAlign: 'center', marginTop: 14 },
});
