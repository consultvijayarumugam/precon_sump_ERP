import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateRangeBar } from '../components/date-range-bar';
import { Chip, ErrorBanner, inputStyle, StageBadge } from '../components/ui';
import { ALL_TIME, leadDateNoun, leadDateParams, rangeLabel, type DateRange } from '../lib/date-range';
import { LEAD_FILTERS, leadListQuery, ownerLine, type LeadListItem, type LeadListPage } from '../lib/dashboard';
import { formatDateTime, productLabel } from '../lib/workflow';
import { useSession, useUser } from '../session';
import { colors } from '../theme';

const PAGE_SIZE = 30;

/**
 * All my leads, like the web Leads page: search by name, phone or city, filter
 * by status or one pipeline stage, newest first. The server returns only the
 * leads this user may see.
 */
export function AllLeadsScreen({ stageId, status: initialStatus, title }: { stageId?: string; status?: string; title?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const { user, can } = useUser();
  const canAdd = can('leads.write') || can('leads.quick_add');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState(() => (LEAD_FILTERS.some((f) => f.key === initialStatus) ? initialStatus! : 'all'));
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const status = LEAD_FILTERS.find((f) => f.key === filter)?.status;
  // Date filter: with Won / Lost, by the day it closed; otherwise by the day it was added.
  const [range, setRange] = useState<DateRange>(ALL_TIME);

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
        const result = await api<LeadListPage>(leadListQuery({ search: term, status, stageId, dates: leadDateParams(range, status), page: nextPage, pageSize: PAGE_SIZE }));
        if (run !== latest.current) return;
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
    [api, term, status, stageId, range],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const more = total !== null && items.length < total;

  return (
    <View style={styles.page}>
      <Stack.Screen
        options={{
          title: title ? `My leads: ${title}` : 'All my leads',
          headerRight: canAdd
            ? () => (
                <Pressable testID="add-lead" onPress={() => router.push('/new-lead')} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="New lead">
                  <Ionicons name="add" size={28} color="#FFFFFF" />
                </Pressable>
              )
            : undefined,
        }}
      />
      <FlatList
        testID="all-leads"
        data={items}
        keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(1, true)} colors={[colors.blue]} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => more && !loading && void load(page + 1)}
        ListHeaderComponent={
          <View>
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
            {!stageId && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} keyboardShouldPersistTaps="handled">
                {LEAD_FILTERS.map((f) => (
                  <Chip key={f.key} testID={`filter-${f.key}`} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} tone={f.key === 'WON' ? 'good' : undefined} />
                ))}
              </ScrollView>
            )}
            <DateRangeBar value={range} onChange={setRange} caption={`${leadDateNoun(status) === 'added' ? 'Added' : leadDateNoun(status) === 'won' ? 'Won' : 'Closed'}: ${rangeLabel(range)}`} />
            <ErrorBanner message={error} />
            {total !== null && (
              <Text style={styles.count}>
                {total} lead{total === 1 ? '' : 's'}
                {term.trim() ? ` matching "${term.trim()}"` : ''}
                {range.preset !== 'all' ? ` · ${leadDateNoun(status)} ${rangeLabel(range).replace(/^This /, 'this ').replace(/^Last /, 'last ').replace(/^Today$/, 'today')}` : ''}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const details = [item.city, productLabel(item)].filter(Boolean).join(' · ');
          const when =
            item.status === 'WON' || item.status === 'LOST'
              ? item.closedAt
                ? `${item.status === 'WON' ? 'Won' : 'Closed'} ${formatDateTime(item.closedAt)}`
                : null
              : item.nextFollowUpAt
                ? `Next follow-up ${formatDateTime(item.nextFollowUpAt)}`
                : 'No follow-up planned';
          const late = item.nextFollowUpAt !== null && new Date(item.nextFollowUpAt) < new Date() && item.status !== 'WON' && item.status !== 'LOST';
          const owner = ownerLine(item, user.id);
          return (
            <Pressable testID={`row-${item.name}`} onPress={() => router.push(`/lead/${item.id}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <StageBadge status={item.status} stage={item.stage} />
                </View>
                <Text style={styles.details}>{[item.phone, details].filter(Boolean).join(' · ')}</Text>
                {when && <Text style={[styles.when, late && styles.late]}>{when}</Text>}
                <Text testID={`owner-${item.name}`} style={[styles.owner, owner.warn && styles.ownerWarn]}>
                  {owner.text}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
            </Pressable>
          );
        }}
        ListEmptyComponent={!loading && total === 0 ? <Text style={styles.empty}>No leads match.</Text> : undefined}
        ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={styles.spinner} color={colors.blue} /> : undefined}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  searchRow: { marginHorizontal: 12, marginTop: 12, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
  search: { paddingLeft: 44 },
  filters: { gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  count: { fontSize: 13, color: colors.ink3, marginHorizontal: 16, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 72, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 12, marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  details: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  when: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 3 },
  late: { color: colors.red },
  owner: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  ownerWarn: { color: colors.amber, fontWeight: '700' },
  empty: { fontSize: 15, color: colors.ink2, textAlign: 'center', marginTop: 40 },
  spinner: { marginVertical: 16 },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
