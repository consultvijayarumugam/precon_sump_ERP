import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ALL_TIME, leadDateNoun, leadDateParams, rangeLabel, type DateRange } from '../lib/date-range';
import { chipLabel, leadListQuery, ownerLine, stageCountsQuery, type LeadListItem, type LeadListPage, type StageCounts } from '../lib/dashboard';
import type { PipelineStage } from '../lib/sales';
import { closedKind, stageFilters } from '../lib/stages';
import { formatDateTime, productLabel, type LeadStatus } from '../lib/workflow';
import { useSession, useUser } from '../session';
import { colors, space } from '../theme';
import { useResource } from '../use-resource';
import { DateRangeBar } from './date-range-bar';
import { Chip, ErrorBanner, inputStyle, StageBadge } from './ui';
import { useLeadActions } from './use-lead-actions';
import { isUnnamed, leadLabel } from '../lib/phone';

const PAGE_SIZE = 30;

/** One lead: who, stage, next step, who has it; Call and WhatsApp right on the row. */
const LeadRow = memo(function LeadRow({ item, meId, onChanged }: { item: LeadListItem; meId: string; onChanged: () => void }) {
  const router = useRouter();
  const actions = useLeadActions({ ...item, nextCallbackAt: item.nextFollowUpAt }, { onChanged });
  const closed = item.status === 'WON' || item.status === 'LOST';
  const details = [item.city, productLabel(item)].filter(Boolean).join(' · ');
  const when = closed
    ? item.closedAt
      ? `${item.status === 'WON' ? 'Won' : 'Closed'} ${formatDateTime(item.closedAt)}`
      : null
    : item.nextFollowUpAt
      ? `Next follow-up ${formatDateTime(item.nextFollowUpAt)}`
      : 'No follow-up planned';
  const late = item.nextFollowUpAt !== null && new Date(item.nextFollowUpAt) < new Date() && !closed;
  const owner = ownerLine(item, meId);
  return (
    <View style={styles.row}>
      <Pressable testID={`row-${leadLabel(item)}`} onPress={() => router.push(`/lead/${item.id}`)} style={({ pressed }) => [styles.flex, pressed && styles.pressed]} accessibilityRole="button" accessibilityHint="Opens the lead">
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {leadLabel(item)}
          </Text>
          <StageBadge status={item.status} stage={item.stage} />
        </View>
        <Text style={styles.details}>{[isUnnamed(item) ? null : item.phone, details].filter(Boolean).join(' · ')}</Text>
        {when && <Text style={[styles.when, late && styles.late]}>{when}</Text>}
        <Text testID={`owner-${leadLabel(item)}`} style={[styles.owner, owner.warn && styles.ownerWarn]}>
          {owner.text}
        </Text>
      </Pressable>
      {!closed && (
        <View style={styles.rowActions}>
          <Pressable testID={`call-${leadLabel(item)}`} onPress={actions.call} style={[styles.iconButton, styles.callButton]} accessibilityRole="button" accessibilityLabel={`Call ${leadLabel(item)}`}>
            <Ionicons name="call" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            testID={`whatsapp-${leadLabel(item)}`}
            onPress={actions.whatsapp}
            onLongPress={actions.whatsappTemplates}
            style={[styles.iconButton, styles.waButton]}
            accessibilityRole="button"
            accessibilityLabel={`WhatsApp ${leadLabel(item)}`}
            accessibilityHint={actions.whatsAppLead ? 'Opens the chat. Long press for templates.' : 'Pick a message to send'}
          >
            <Ionicons name="logo-whatsapp" size={20} color={colors.whatsapp} />
          </Pressable>
        </View>
      )}
      {actions.sheets}
    </View>
  );
});

/**
 * Every lead you can see (the server decides: a telecaller's assigned leads
 * and the ones they handed to sales, a salesperson's own, everyone's for an
 * admin), newest first. It loads straight away; search, the stage chips (the
 * admin's live pipeline stages) and the date filter only narrow it, and all
 * three combine. "All time" means no date filter at all.
 */
export function LeadsList({
  stageId: fixedStageId,
  status,
  assignedToId,
  header,
  bottomPad = 16,
}: {
  /** Fixed by the screen (a pipeline bar was tapped): no stage chips. */
  stageId?: string;
  /** Fixed by the screen (Won / Lost this month). */
  status?: LeadStatus;
  /** Admin: one person's leads. */
  assignedToId?: string;
  /** Shown above the search box (e.g. the My Leads view switch). */
  header?: ReactElement;
  bottomPad?: number;
}) {
  const { api } = useSession();
  const { user } = useUser();
  // Live from the server on every visit: stages added or renamed on the web show here without an app update.
  const stages = useResource<PipelineStage[]>('/pipeline-stages');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [chosenStage, setChosenStage] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  // How many leads each stage chip holds under the same search, dates and person.
  const [counts, setCounts] = useState<StageCounts | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const stageId = fixedStageId ?? chosenStage ?? undefined;
  const stage = stages.data?.find((s) => s.id === stageId);
  // Won and Lost by the day they closed; everything else by the day it was added.
  const closedAs = status === 'WON' || status === 'LOST' ? status : closedKind(stage);

  // Search after a short pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (nextPage: number, pulled = false) => {
      const run = ++latest.current;
      setLoading(true);
      if (pulled) setRefreshing(true);
      try {
        const query = leadListQuery({ search: term, status, stageId, dates: leadDateParams(range, closedAs), page: nextPage, pageSize: PAGE_SIZE });
        const showChips = !fixedStageId && !status;
        const [result, stageCounts] = await Promise.all([
          api<LeadListPage>(assignedToId ? `${query}&assignedToId=${assignedToId}` : query),
          // Counts only matter when the stage chips show; a failure just leaves them off.
          showChips && nextPage === 1
            ? api<StageCounts>(stageCountsQuery({ search: term, dates: leadDateParams(range, undefined), assignedToId })).catch(() => null)
            : Promise.resolve(undefined),
        ]);
        if (run !== latest.current) return;
        if (stageCounts !== undefined) setCounts(stageCounts);
        setItems((prev) => (nextPage === 1 ? result.items : [...prev, ...result.items]));
        setTotal(result.total);
        setPage(nextPage);
        setError(null);
      } catch (err) {
        if (run === latest.current) setError(err instanceof Error ? err.message : 'Could not load leads.');
      } finally {
        if (run === latest.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [api, term, status, stageId, range, closedAs, assignedToId, fixedStageId],
  );

  // Load on opening (and whenever a filter changes), and again on coming back from a lead.
  useFocusEffect(
    useCallback(() => {
      void load(1);
    }, [load]),
  );

  const more = total !== null && items.length < total;
  const dateWord = closedAs === 'WON' ? 'Won' : closedAs === 'LOST' ? 'Closed' : 'Added';

  return (
    <FlatList
      testID="all-leads"
      data={items}
      keyExtractor={(l) => l.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            stages.reload();
            void load(1, true);
          }}
          colors={[colors.blue]}
        />
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => more && !loading && void load(page + 1)}
      ListHeaderComponent={
        <View>
          {header}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={20} color={colors.ink3} style={styles.searchIcon} />
            <TextInput
              testID="lead-search"
              style={[inputStyle, styles.search]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, phone or city"
              placeholderTextColor={colors.ink3}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
          {!fixedStageId && !status && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} keyboardShouldPersistTaps="handled" testID="stage-chips">
              <Chip testID="filter-all" label={chipLabel('All stages', counts, null)} active={chosenStage === null} onPress={() => setChosenStage(null)} />
              {stageFilters(stages.data ?? []).map((s) => (
                <Chip
                  key={s.id}
                  testID={`filter-${s.name}`}
                  // Won/Lost list by close date, counts by date added: with a date range set, leave their count off.
                  label={chipLabel(s.name, (s.kind === 'WON' || s.kind === 'LOST') && range.preset !== 'all' ? null : counts, s.id)}
                  active={chosenStage === s.id}
                  onPress={() => setChosenStage(s.id)}
                  tone={s.kind === 'WON' ? 'good' : s.kind === 'LOST' ? 'danger' : undefined}
                />
              ))}
            </ScrollView>
          )}
          <DateRangeBar value={range} onChange={setRange} caption={`${dateWord}: ${rangeLabel(range)}`} />
          <ErrorBanner message={error ?? stages.error} />
          {total !== null && (
            <Text style={styles.count} testID="lead-count">
              {total} lead{total === 1 ? '' : 's'}
              {stage ? ` in ${stage.name}` : ''}
              {term.trim() ? ` matching "${term.trim()}"` : ''}
              {range.preset !== 'all' ? ` · ${leadDateNoun(closedAs)} ${rangeLabel(range).replace(/^This /, 'this ').replace(/^Last /, 'last ').replace(/^Today$/, 'today')}` : ''}
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => <LeadRow item={item} meId={user.id} onChanged={() => void load(1)} />}
      ListEmptyComponent={
        !loading && total === 0 ? (
          <Text style={styles.empty}>{range.preset !== 'all' || stageId || term.trim() ? 'No leads match. Try All stages or All time.' : 'No leads yet. New leads appear here as they arrive.'}</Text>
        ) : undefined
      }
      ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={styles.spinner} color={colors.blue} /> : undefined}
      contentContainerStyle={{ paddingBottom: bottomPad }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  searchRow: { marginHorizontal: 12, marginTop: 12, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
  search: { paddingLeft: 44 },
  filters: { gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  count: { fontSize: 13, color: colors.ink3, marginHorizontal: 16, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 72, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 12, marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  details: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  when: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 3 },
  late: { color: colors.red },
  owner: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  ownerWarn: { color: colors.amber, fontWeight: '700' },
  rowActions: { gap: 8 },
  iconButton: { width: space.tap, height: space.tap, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  callButton: { backgroundColor: colors.blue },
  waButton: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.greenLine },
  empty: { fontSize: 15, color: colors.ink2, textAlign: 'center', marginTop: 40, marginHorizontal: 24 },
  spinner: { marginVertical: 16 },
});
