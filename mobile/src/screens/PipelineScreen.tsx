import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { PipelineCard } from '../components/dashboard-cards';
import { Button, Centered, ErrorBanner } from '../components/ui';
import { leadsByStage, salesBucket, type SalesDashboardData, type SalesLead } from '../lib/sales';
import { formatDateTime, productLabel } from '../lib/workflow';
import { colors } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';
import { formatDay, salesStyles } from './SalesLeadsScreen';
import { leadLabel } from '../lib/phone';

/** A lead in a stage list: name, place and product, next follow-up. Tap to open it. */
function StageLeadRow({ lead }: { lead: SalesLead }) {
  const router = useRouter();
  const bucket = salesBucket(lead);
  const details = [lead.city, productLabel(lead)].filter(Boolean).join(' · ');
  return (
    <Pressable testID={`pl-${leadLabel(lead)}`} onPress={() => router.push(`/lead/${lead.id}`)} style={({ pressed }) => [styles.row, bucket === 'overdue' && styles.rowLate, pressed && styles.pressed]} accessibilityRole="button" accessibilityHint="Opens the lead">
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {leadLabel(lead)}
        </Text>
        {details !== '' && <Text style={salesStyles.details}>{details}</Text>}
        <Text style={[styles.when, bucket === 'overdue' && { color: colors.red }, bucket === 'none' && { color: colors.ink3 }]}>
          {lead.nextFollowUp ? `Follow-up ${bucket === 'overdue' ? 'was due' : 'due'} ${formatDateTime(lead.nextFollowUp.scheduledAt)}` : 'No follow-up planned'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
    </Pressable>
  );
}

/**
 * Pipeline (sales tab): my open leads per sales stage as bars (tap a bar for
 * the searchable list), then every stage with its leads, then this month's wins.
 */
export function PipelineScreen() {
  const router = useRouter();
  const pad = useBottomPad();
  const { data, error, refreshing, refresh, reload } = useResource<SalesDashboardData>('/dashboards/sales');
  const groups = useMemo(() => (data ? leadsByStage(data.stages, data.open) : []), [data]);
  const won = useMemo(() => (data?.closedThisMonth ?? []).filter((l) => l.status === 'WON'), [data]);
  const sections = useMemo(
    () => [
      ...groups.map((g) => ({ key: g.key, title: `${g.title}${g.isActive ? '' : ' (off)'}`, color: colors.blue, data: g.data, won: false })),
      ...(won.length ? [{ key: 'won', title: 'Won this month', color: colors.green, data: won, won: true }] : []),
    ],
    [groups, won],
  );
  const rows = (data?.stages ?? []).map((st) => ({ id: st.id, name: st.name, isActive: st.isActive, count: st.leads }));

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: 'My pipeline' }} />
      <SectionList
        testID="sales-pipeline"
        sections={sections}
        keyExtractor={(l) => l.id}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.blue]} />}
        ListHeaderComponent={
          <>
            {error && (
              <View style={styles.pad}>
                <ErrorBanner message={error} />
              </View>
            )}
            {data ? (
              <PipelineCard
                title="Leads per stage"
                subtitle={`${data.pipeline.QUALIFIED + data.pipeline.QUOTED} open deals · tap a stage to see its leads`}
                rows={rows}
                extra={[
                  { key: 'won', label: 'Won this month', count: data.pipeline.wonThisMonth, tone: 'good', status: 'WON' },
                  { key: 'lost', label: 'Lost this month', count: data.pipeline.lostThisMonth, tone: 'muted', status: 'LOST' },
                ]}
              />
            ) : (
              <View style={salesStyles.loading}>{error ? <Button label="Try again" onPress={reload} /> : <Centered />}</View>
            )}
          </>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[salesStyles.section, { color: section.color }]}>
            {section.title} · {section.data.length}
          </Text>
        )}
        renderItem={({ item, section }) =>
          section.won ? (
            <Pressable testID={`won-${leadLabel(item)}`} onPress={() => router.push(`/lead/${item.id}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
              <Ionicons name="trophy" size={22} color={colors.green} />
              <View style={styles.flex}>
                <Text style={styles.name}>{leadLabel(item)}</Text>
                <Text style={salesStyles.details}>{[productLabel(item), item.city].filter(Boolean).join(' · ') || 'Won'}</Text>
              </View>
              {item.closedAt && <Text style={styles.date}>{formatDay(item.closedAt)}</Text>}
            </Pressable>
          ) : (
            <StageLeadRow lead={item} />
          )
        }
        ListEmptyComponent={data ? <Text style={salesStyles.empty}>No open deals yet. Leads that telecallers hand over to you appear here.</Text> : undefined}
        contentContainerStyle={{ paddingBottom: pad }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 12, paddingTop: 8 },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 12, marginBottom: 8 },
  rowLate: { borderColor: colors.redLine },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  when: { fontSize: 14, fontWeight: '600', color: colors.ink2, marginTop: 3 },
  date: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
});
