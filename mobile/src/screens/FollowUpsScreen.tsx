import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { DateRangeBar } from '../components/date-range-bar';
import { FollowUpSheet } from '../components/follow-up-sheet';
import { ALL_TIME, rangeLabel, type DateRange } from '../lib/date-range';
import { Centered, Chip, ErrorBanner, StageBadge } from '../components/ui';
import { FOLLOW_UP_OUTCOME_LABELS, FOLLOW_UP_TABS, followUpsPath, type FollowUpTab, type FollowUpWithLead } from '../lib/followups';
import { formatDateTime, productLabel } from '../lib/workflow';
import { useUser } from '../session';
import { colors, space } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';

/** One follow-up: lead, when, note; tap to mark it done or move it (or open the lead, once done). */
export function FollowUpRow({ f, onPress }: { f: FollowUpWithLead; onPress: () => void }) {
  const late = !f.completedAt && new Date(f.scheduledAt) < new Date();
  const product = productLabel(f.lead);
  return (
    <Pressable testID={`fu-${f.lead.name}`} onPress={onPress} style={({ pressed }) => [styles.row, late && styles.rowLate, pressed && styles.pressed]} accessibilityRole="button">
      <Ionicons name={f.completedAt ? 'checkmark-circle' : 'alarm-outline'} size={22} color={f.completedAt ? colors.green : late ? colors.red : colors.blue} />
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {f.lead.name}
          </Text>
          <StageBadge status={f.lead.status} stage={f.lead.stage} />
        </View>
        <Text style={[styles.when, late && styles.late]}>
          {f.completedAt ? `Done ${formatDateTime(f.completedAt)}${f.outcome ? ` · ${FOLLOW_UP_OUTCOME_LABELS[f.outcome]}` : ''}` : `${late ? 'Was due' : 'Due'} ${formatDateTime(f.scheduledAt)}`}
        </Text>
        {f.note ? <Text style={styles.note}>{f.note}</Text> : null}
        <Text style={styles.meta}>{[f.lead.phone, product].filter(Boolean).join(' · ')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
    </Pressable>
  );
}

/** My follow-ups, as on the web Follow-ups page: overdue, upcoming and done. */
export function FollowUpsScreen({ calendarLink = true }: { calendarLink?: boolean }) {
  const router = useRouter();
  const pad = useBottomPad();
  const { can } = useUser();
  const [tab, setTab] = useState<FollowUpTab>('overdue');
  // Date filter: the days they were (or are) due, combined with the tab.
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const { data, error, refreshing, refresh, reload } = useResource<FollowUpWithLead[]>(followUpsPath(tab, range));
  const [open, setOpen] = useState<FollowUpWithLead | null>(null);
  const canWrite = can('followups.write');
  const noun = can('leads.receive_qualified') ? 'follow-up' : 'callback';

  return (
    <View style={styles.page}>
      <Stack.Screen
        options={{
          title: noun === 'follow-up' ? 'My follow-ups' : 'My callbacks',
          // On the telecaller's Callbacks tab the calendar is its own tab.
          ...(calendarLink && {
            headerRight: () => (
              <Pressable testID="open-calendar" onPress={() => router.push('/calendar')} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Calendar">
                <Ionicons name="calendar-outline" size={24} color="#FFFFFF" />
              </Pressable>
            ),
          }),
        }}
      />
      <View style={styles.tabs}>
        {FOLLOW_UP_TABS.map((t) => (
          <Chip key={t.key} testID={`fu-tab-${t.key}`} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} tone={t.key === 'overdue' ? 'danger' : t.key === 'completed' ? 'good' : undefined} />
        ))}
      </View>
      <DateRangeBar value={range} onChange={setRange} caption={`Due: ${rangeLabel(range)}`} />
      <ErrorBanner message={error} />
      {!data && !error ? (
        <Centered />
      ) : (
        <FlatList
          testID="follow-ups"
          data={data ?? []}
          keyExtractor={(f) => f.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.blue]} />}
          renderItem={({ item }) => <FollowUpRow f={item} onPress={() => (item.completedAt || !canWrite ? router.push(`/lead/${item.lead.id}`) : setOpen(item))} />}
          ListHeaderComponent={data && data.length > 0 ? <Text style={styles.count}>{data.length} {tab === 'completed' ? 'done' : tab}</Text> : undefined}
          ListEmptyComponent={
            <Text style={styles.empty}>{tab === 'overdue' ? 'Nothing overdue. 🎉' : tab === 'upcoming' ? `No ${noun}s planned yet.` : `No ${noun}s done yet.`}</Text>
          }
          contentContainerStyle={{ paddingBottom: pad }}
        />
      )}
      {open && (
        <FollowUpSheet
          followUp={open}
          leadName={open.lead.name}
          noun={noun}
          onClose={() => setOpen(null)}
          onDone={(message) => {
            setOpen(null);
            ToastAndroid.show(message, ToastAndroid.SHORT);
            reload();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  headerButton: { width: space.tap, height: space.tap, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  count: { fontSize: 13, color: colors.ink3, marginHorizontal: 16, marginTop: 8, marginBottom: 6, textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 12, marginBottom: 8 },
  rowLate: { borderColor: colors.redLine },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  when: { fontSize: 14, fontWeight: '600', color: colors.ink2, marginTop: 3 },
  late: { color: colors.red },
  note: { fontSize: 14, color: colors.ink2, marginTop: 2 },
  meta: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  empty: { fontSize: 15, color: colors.ink2, textAlign: 'center', marginTop: 40 },
});
