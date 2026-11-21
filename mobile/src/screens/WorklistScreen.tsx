import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useMemo, useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { DateRangeBar } from '../components/date-range-bar';
import { Button, Centered, ErrorBanner, StageBadge } from '../components/ui';
import { ALL_TIME, inRange, rangeLabel, type DateRange } from '../lib/date-range';
import { useLeadActions } from '../components/use-lead-actions';
import { CALL_OUTCOME_LABELS, formatDateTime, productLabel, TelecallerData, toSections, WorklistBucket, WorklistItem } from '../lib/workflow';
import { colors } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';
import { leadLabel } from '../lib/phone';

export const BUCKET_COLOR: Record<WorklistBucket, string> = {
  overdue: colors.red,
  today: colors.amber,
  new: colors.blue,
  no_next_step: colors.ink2,
  later: colors.ink3,
};

export const WorkCard = memo(function WorkCard({ item, onChanged }: { item: WorklistItem; onChanged: () => void }) {
  const router = useRouter();
  const actions = useLeadActions({ ...item, nextCallbackAt: item.nextCallback?.scheduledAt ?? null }, { onChanged });
  const overdue = item.bucket === 'overdue';
  const details = [item.city, productLabel(item)].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, overdue && styles.cardOverdue]}>
      <Pressable testID={`lead-${leadLabel(item)}`} onPress={() => router.push(`/lead/${item.id}`)} accessibilityRole="button" accessibilityHint="Opens the lead">
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {leadLabel(item)}
          </Text>
          <StageBadge status={item.status} stage={item.stage} />
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        </View>
        {details !== '' && <Text style={styles.details}>{details}</Text>}
        <Text style={[styles.callback, overdue && styles.callbackOverdue]}>
          {item.nextCallback ? `Callback ${overdue ? 'was due' : 'due'} ${formatDateTime(item.nextCallback.scheduledAt)}` : 'No callback set'}
        </Text>
        <Text style={styles.details}>{item.lastCall ? `Last call: ${CALL_OUTCOME_LABELS[item.lastCall.outcome]} (${item.callCount} call${item.callCount === 1 ? '' : 's'})` : 'Not called yet'}</Text>
      </Pressable>
      <View style={styles.actions}>
        <Button testID={`call-${leadLabel(item)}`} label={item.phone} icon="call" onPress={actions.call} style={styles.flex} />
        <Button
          testID={`whatsapp-${leadLabel(item)}`}
          label="WhatsApp"
          icon="logo-whatsapp"
          tone="whatsapp"
          onPress={actions.whatsapp}
          onLongPress={actions.whatsappTemplates}
          accessibilityHint={actions.whatsAppLead ? 'Opens the chat. Long press for templates.' : 'Pick a message to send'}
          busy={actions.opening}
          style={styles.flex}
        />
      </View>
      {actions.sheets}
    </View>
  );
});

/**
 * My Leads (telecaller tab): who to call, most urgent first — overdue
 * callbacks, due today, new, no callback set, later. Call and WhatsApp on
 * every card; tap a card for the lead page.
 */
export function WorklistScreen({ header }: { header?: ReactElement }) {
  const pad = useBottomPad();
  const { data, error, refreshing, refresh, reload } = useResource<TelecallerData>('/dashboards/telecaller');
  // Date filter: when the lead arrived; the list keeps its most-urgent-first order.
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const shown = useMemo(() => (data?.items ?? []).filter((l) => inRange(l.createdAt, range)), [data, range]);
  const sections = useMemo(() => toSections(shown), [shown]);

  return (
    <View style={styles.page}>
      <SectionList
        testID="worklist"
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {header}
            <DateRangeBar value={range} onChange={setRange} caption={`Arrived: ${rangeLabel(range)} · ${shown.length} of ${(data?.items ?? []).length}`} />
            {error && (
              <View style={styles.pad}>
                <ErrorBanner message={error} />
              </View>
            )}
          </>
        }
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.blue]} />}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.section, { color: BUCKET_COLOR[section.bucket] }]}>
            {section.title} · {section.data.length}
          </Text>
        )}
        renderItem={({ item }) => <WorkCard item={item} onChanged={reload} />}
        ListEmptyComponent={
          data ? (
            <Centered>
              <Ionicons name="checkmark-circle-outline" size={44} color={colors.ink3} />
              <Text style={styles.empty}>{range.preset !== 'all' ? 'None in these dates. Pick All time to see every lead.' : 'Nothing to call right now. New leads appear here as they arrive.'}</Text>
            </Centered>
          ) : error ? (
            <View style={styles.pad}>
              <Button label="Try again" onPress={reload} />
            </View>
          ) : (
            <View style={styles.loading}>
              <Centered />
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: pad }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 12, paddingTop: 8 },
  loading: { paddingTop: 64 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, marginHorizontal: 12, marginBottom: 10 },
  cardOverdue: { borderColor: colors.redLine },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 18, fontWeight: '700', color: colors.ink },
  details: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  callback: { fontSize: 14, fontWeight: '600', color: colors.ink2, marginTop: 6 },
  callbackOverdue: { color: colors.red },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  empty: { marginTop: 10, fontSize: 15, color: colors.ink2, textAlign: 'center' },
});
