import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DASHBOARD_PRESETS, presetRange, rangeLabel, type DateRange } from '../lib/date-range';
import { pct, periodTiles, rupees, talk, type PeriodReportData } from '../lib/period-report';
import { colors } from '../theme';
import { useResource } from '../use-resource';
import { DateRangeBar } from './date-range-bar';
import { ErrorBanner } from './ui';

/**
 * "My results" / "Team results" for a date range, as on the web dashboards:
 * Today, This week, This month (default), Last month or Custom. Each person
 * sees only their own numbers; admins see the team and a line per person.
 */
export function PeriodReportCard({ title }: { title: string }) {
  const [range, setRange] = useState<DateRange>(() => presetRange('month'));
  const { data, error } = useResource<PeriodReportData>(`/dashboards/period?from=${range.from}&to=${range.to}`);
  // Revenue is the total of sales orders, which only exist with the operations modules on.
  const config = useResource<{ operationsEnabled: boolean }>('/config');
  const showRevenue = config.data?.operationsEnabled === true;
  const tiles = data ? periodTiles(data, { showRevenue }) : [];

  return (
    <View style={styles.card} testID="period-report">
      <View style={styles.head}>
        <Ionicons name="stats-chart-outline" size={18} color={colors.blue} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.range}>{rangeLabel(range)}</Text>
      </View>
      <View style={styles.bar}>
        <DateRangeBar value={range} onChange={setRange} presets={DASHBOARD_PRESETS} testID="period" />
      </View>
      <ErrorBanner message={error} />
      {!data && !error && <Text style={styles.muted}>Loading…</Text>}
      <View style={styles.grid}>
        {tiles.map((t) => (
          <View key={t.key} style={styles.tile} testID={`period-${t.key}`}>
            <Text style={styles.value}>{t.value}</Text>
            <Text style={styles.label}>{t.label}</Text>
            {t.hint ? <Text style={styles.hint}>{t.hint}</Text> : null}
          </View>
        ))}
      </View>
      {data?.people && data.people.length > 0 && (
        <View style={styles.people}>
          <Text style={styles.peopleTitle}>By person</Text>
          {data.people.map((p) => (
            <View key={`${p.kind}-${p.id}`} style={styles.person}>
              <Text style={styles.personName}>
                {p.fullName}
                <Text style={styles.personRole}> · {p.kind === 'telecaller' ? 'Telecaller' : 'Sales'}</Text>
              </Text>
              <Text style={styles.personLine}>
                {p.kind === 'telecaller'
                  ? `${p.leadsIn} leads · ${p.callsLogged} calls · ${p.qualified ?? 0} qualified (${pct(p.conversionRate)}) · talk ${talk(p.talkSeconds)}`
                  : `${p.leadsIn} handed over · ${p.won} won, ${p.lost} lost${showRevenue && p.revenue !== null ? ` · ${rupees(p.revenue)}` : ''} · ${p.siteVisits} visits`}
              </Text>
              <Text style={styles.personLine}>Follow-ups on time: {pct(p.followUpCompliance)} ({p.followUpsDone}/{p.followUpsDue})</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingVertical: 14, marginHorizontal: 12, marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  range: { marginLeft: 'auto', fontSize: 13, fontWeight: '600', color: colors.blue },
  bar: { marginHorizontal: -0, marginBottom: 4 },
  muted: { fontSize: 14, color: colors.ink3, paddingHorizontal: 14, paddingTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  tile: { width: '48.5%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 },
  value: { fontSize: 22, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 1 },
  hint: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  people: { marginTop: 12, paddingHorizontal: 14 },
  peopleTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.ink2, marginBottom: 4 },
  person: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  personName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  personRole: { fontWeight: '400', color: colors.ink3 },
  personLine: { fontSize: 13, color: colors.ink2, marginTop: 2 },
});
