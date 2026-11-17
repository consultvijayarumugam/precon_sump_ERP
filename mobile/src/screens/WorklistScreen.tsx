import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { memo, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountSheet } from '../components/account-sheet';
import { DailyQuoteCard, PipelineCard, RemindersCard } from '../components/dashboard-cards';
import { Button, Centered, ErrorBanner, StageBadge } from '../components/ui';
import { useLeadActions } from '../components/use-lead-actions';
import { pipelineRows, type LeadsSummary } from '../lib/dashboard';
import type { PipelineStage } from '../lib/sales';
import { CALL_OUTCOME_LABELS, formatDateTime, productLabel, TelecallerData, toSections, WorklistBucket, WorklistItem } from '../lib/workflow';
import { useUser } from '../session';
import { colors, space } from '../theme';
import { useCallSync } from '../use-call-sync';
import { useResource } from '../use-resource';

const BUCKET_COLOR: Record<WorklistBucket, string> = {
  overdue: colors.red,
  today: colors.amber,
  new: colors.blue,
  no_next_step: colors.ink2,
  later: colors.ink3,
};

const WorkCard = memo(function WorkCard({ item, onChanged }: { item: WorklistItem; onChanged: () => void }) {
  const router = useRouter();
  const actions = useLeadActions({ ...item, nextCallbackAt: item.nextCallback?.scheduledAt ?? null }, { onChanged });
  const overdue = item.bucket === 'overdue';
  const details = [item.city, productLabel(item)].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, overdue && styles.cardOverdue]}>
      <Pressable testID={`lead-${item.name}`} onPress={() => router.push(`/lead/${item.id}`)} accessibilityRole="button" accessibilityHint="Opens the lead">
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
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
        <Button testID={`call-${item.name}`} label={item.phone} icon="call" onPress={actions.call} style={styles.flex} />
        <Button
          testID={`whatsapp-${item.name}`}
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

function Tile({ value, label, alert }: { value: number | undefined; label: string; alert?: boolean }) {
  return (
    <View style={[styles.tile, alert && styles.tileAlert]}>
      <Text style={styles.tileValue}>{value ?? '–'}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/**
 * The telecaller's dashboard, as on web: today's counts, the quote, my
 * reminders, then who to call next (most urgent first), and my pipeline.
 */
export function WorklistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { data, error, refreshing, refresh, reload } = useResource<TelecallerData>('/dashboards/telecaller');
  const summary = useResource<LeadsSummary>('/leads/summary');
  const stages = useResource<PipelineStage[]>('/pipeline-stages');
  const [account, setAccount] = useState(false);
  useCallSync();
  const sections = useMemo(() => toSections(data?.items ?? []), [data]);
  const pipeline = useMemo(() => (summary.data && stages.data ? pipelineRows(stages.data, summary.data.leadsByStage) : null), [summary.data, stages.data]);
  const c = data?.counts;
  const refreshAll = () => {
    refresh();
    summary.reload();
    stages.reload();
  };

  const header = (
    <>
      <LinearGradient colors={[colors.navy950, colors.ocean]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text style={styles.greeting}>Hi {user.fullName.split(/\s+/)[0]}</Text>
            <Text style={styles.heroSub}>{c ? `${c.overdue + c.callbacksDueToday + c.notCalledYet} leads to call now` : 'Your call list, most urgent first'}</Text>
          </View>
          <Pressable testID="account" onPress={() => setAccount(true)} style={styles.accountButton} accessibilityRole="button" accessibilityLabel="Account">
            <Ionicons name="person-circle-outline" size={32} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.tiles}>
          <Tile value={c?.newToday} label="New today" />
          <Tile value={c?.callbacksDueToday} label="Due today" />
          <Tile value={c?.overdue} label="Overdue" alert={(c?.overdue ?? 0) > 0} />
          <Tile value={c?.callsToday} label="Calls today" />
        </View>
        {c && (
          <Text style={styles.hints}>
            {c.notCalledYet} not called yet · {c.callsThisWeek} calls this week · {c.qualifiedToday} qualified today
          </Text>
        )}
        <Pressable testID="all-leads-button" onPress={() => router.push('/leads')} style={({ pressed }) => [styles.allLeads, pressed && styles.pressed]} accessibilityRole="button">
          <Ionicons name="list" size={20} color="#FFFFFF" />
          <Text style={styles.allLeadsText}>All my leads</Text>
        </Pressable>
      </LinearGradient>
      <DailyQuoteCard />
      <RemindersCard />
      {error && (
        <View style={styles.pad}>
          <ErrorBanner message={error} />
        </View>
      )}
    </>
  );

  return (
    <View style={styles.page}>
      <StatusBar style="light" />
      <SectionList
        testID="worklist"
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} colors={[colors.blue]} progressViewOffset={insets.top} />}
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
              <Text style={styles.empty}>Nothing to call right now. New leads appear here as they arrive.</Text>
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
        ListFooterComponent={
          pipeline ? (
            <PipelineCard title="My pipeline" subtitle={summary.data ? `${summary.data.openLeads} open of ${summary.data.totalLeads} leads · tap a stage to see its leads` : undefined} rows={pipeline} />
          ) : undefined
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      />
      {account && <AccountSheet onClose={() => setAccount(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 12, paddingTop: 8 },
  loading: { paddingTop: 64 },
  hero: { paddingHorizontal: 16, paddingBottom: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  greeting: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  heroSub: { color: '#C9DDF5', fontSize: 14, marginTop: 2 },
  accountButton: { width: space.tap, height: space.tap, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: '#FFFFFF1F', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  tileAlert: { backgroundColor: '#DC2626' },
  tileValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tileLabel: { color: '#E6F0FC', fontSize: 12, marginTop: 1 },
  hints: { color: '#C9DDF5', fontSize: 13, marginTop: 10 },
  allLeads: { marginTop: 12, minHeight: space.tap, borderRadius: space.radius, borderWidth: 1.5, borderColor: '#FFFFFF66', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  allLeadsText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8 },
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
