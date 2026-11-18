import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { DateRangeBar } from '../components/date-range-bar';
import { Button, Centered, ErrorBanner, SearchLeadsLink, StageBadge } from '../components/ui';
import { ALL_TIME, inRange, rangeLabel, type DateRange } from '../lib/date-range';
import { useLeadActions } from '../components/use-lead-actions';
import { salesBucket, salesSections, type SalesBucket, type SalesDashboardData, type SalesLead } from '../lib/sales';
import { formatDateTime, productLabel } from '../lib/workflow';
import { colors } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';

export const SALES_BUCKET_COLOR: Record<SalesBucket, string> = { overdue: colors.red, today: colors.amber, none: colors.ink2, later: colors.ink3 };

export const formatDay = (at: string) => new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** One of my leads: who, stage, next follow-up, who handed it over; call and WhatsApp right there. */
export const SalesCard = memo(function SalesCard({ lead, onChanged }: { lead: SalesLead; onChanged: () => void }) {
  const router = useRouter();
  const actions = useLeadActions({ ...lead, nextCallbackAt: lead.nextFollowUp?.scheduledAt ?? null }, { onChanged });
  const bucket = salesBucket(lead);
  const details = [lead.city, productLabel(lead)].filter(Boolean).join(' · ');
  const followUp = lead.nextFollowUp
    ? `Follow-up ${bucket === 'overdue' ? 'was due' : 'due'} ${formatDateTime(lead.nextFollowUp.scheduledAt)}`
    : 'No follow-up planned';

  return (
    <View style={[styles.card, bucket === 'overdue' && styles.cardOverdue]}>
      <Pressable testID={`lead-${lead.name}`} onPress={() => router.push(`/lead/${lead.id}`)} accessibilityRole="button" accessibilityHint="Opens the lead">
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {lead.name}
          </Text>
          <StageBadge status={lead.status} stage={lead.stage} />
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        </View>
        {details !== '' && <Text style={styles.details}>{details}</Text>}
        <Text style={[styles.followUp, { color: bucket === 'overdue' ? colors.red : bucket === 'none' ? colors.ink3 : colors.ink2 }]}>{followUp}</Text>
        {lead.nextFollowUp?.note ? <Text style={styles.details}>{lead.nextFollowUp.note}</Text> : null}
        {lead.qualifiedBy && (
          <Text style={styles.details}>
            From {lead.qualifiedBy.fullName}
            {lead.qualifiedAt ? ` · ${formatDay(lead.qualifiedAt)}` : ''}
          </Text>
        )}
      </Pressable>
      <View style={styles.actions}>
        <Button testID={`call-${lead.name}`} label={lead.phone} icon="call" onPress={actions.call} style={styles.flex} />
        <Button
          testID={`whatsapp-${lead.name}`}
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
 * My Leads (sales tab): the open leads handed to me. Overdue follow-ups first,
 * then today's, then leads with nothing planned, then later ones.
 */
export function SalesLeadsScreen() {
  const router = useRouter();
  const pad = useBottomPad();
  const { data, error, refreshing, refresh, reload } = useResource<SalesDashboardData>('/dashboards/sales');
  // Date filter: when the lead was handed to you; the list keeps its most-urgent-first order.
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const shown = useMemo(() => (data?.open ?? []).filter((l) => inRange(l.qualifiedAt, range)), [data, range]);
  const sections = useMemo(() => salesSections(shown), [shown]);

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: data ? `My leads · ${data.open.length}` : 'My leads' }} />
      <SectionList
        testID="sales-leads"
        sections={sections}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={
          <>
            <SearchLeadsLink onPress={() => router.push('/leads')} />
            <DateRangeBar value={range} onChange={setRange} caption={`Handed to you: ${rangeLabel(range)} · ${shown.length} of ${(data?.open ?? []).length}`} />
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
          <Text style={[styles.section, { color: SALES_BUCKET_COLOR[section.bucket] }]}>
            {section.title} · {section.data.length}
          </Text>
        )}
        renderItem={({ item }) => <SalesCard lead={item} onChanged={reload} />}
        ListEmptyComponent={
          data ? (
            <Centered>
              <Ionicons name="checkmark-circle-outline" size={44} color={colors.ink3} />
              <Text style={styles.empty}>{range.preset !== 'all' ? 'None in these dates. Pick All time to see every lead.' : 'No open leads yet. Leads that telecallers hand over to you appear here.'}</Text>
            </Centered>
          ) : (
            <View style={styles.loading}>{error ? <Button label="Try again" onPress={reload} /> : <Centered />}</View>
          )
        }
        contentContainerStyle={{ paddingBottom: pad }}
      />
    </View>
  );
}

export const salesStyles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  rowCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 4, marginHorizontal: 12, marginBottom: 10 },
  empty: { marginTop: 10, fontSize: 15, color: colors.ink2, textAlign: 'center' },
  loading: { paddingTop: 64, paddingHorizontal: 12 },
  details: { fontSize: 13, color: colors.ink3, marginTop: 3 },
});

const styles = StyleSheet.create({
  ...salesStyles,
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 12, paddingTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, marginHorizontal: 12, marginBottom: 10 },
  cardOverdue: { borderColor: colors.redLine },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 18, fontWeight: '700', color: colors.ink },
  followUp: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
