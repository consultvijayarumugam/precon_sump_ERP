import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { memo, ReactElement, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountSheet } from '../components/account-sheet';
import { DailyQuoteCard, PipelineCard, RemindersCard, ShortcutRow, VisitsMap } from '../components/dashboard-cards';
import { SiteVisitSheet, VisitRow } from '../components/site-visit';
import { Button, Centered, ErrorBanner, StageBadge } from '../components/ui';
import { useLeadActions } from '../components/use-lead-actions';
import { formatRupees, salesBucket, salesCounts, salesSections, type SalesBucket, type SalesDashboardData, type SalesLead } from '../lib/sales';
import { formatDateTime, productLabel } from '../lib/workflow';
import { useUser } from '../session';
import { colors, space } from '../theme';
import { useCallSync } from '../use-call-sync';
import { useResource } from '../use-resource';
import { NotificationBell } from './NotificationsScreen';

const BUCKET_COLOR: Record<SalesBucket, string> = { overdue: colors.red, today: colors.amber, none: colors.ink2, later: colors.ink3 };
type Tab = 'today' | 'pipeline' | 'visits' | 'won';

const formatDay = (at: string) => new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** One of my leads: who, stage, next follow-up, who handed it over; call and WhatsApp right there. */
const SalesCard = memo(function SalesCard({ lead, onChanged }: { lead: SalesLead; onChanged: () => void }) {
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

function Tile({ value, label, alert }: { value: number | undefined; label: string; alert?: boolean }) {
  return (
    <View style={[styles.tile, alert && styles.tileAlert]}>
      <Text style={styles.tileValue}>{value ?? '–'}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Tabs({ tab, onChange, counts }: { tab: Tab; onChange: (t: Tab) => void; counts: Partial<Record<Tab, number>> }) {
  const items: { key: Tab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'visits', label: 'Visits' },
    { key: 'won', label: 'Won' },
  ];
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {items.map((t) => (
        <Pressable
          key={t.key}
          testID={`tab-${t.key}`}
          onPress={() => onChange(t.key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === t.key }}
          style={[styles.tab, tab === t.key && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>
            {t.label}
            {counts[t.key] ? ` ${counts[t.key]}` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The salesperson's dashboard, as on web: key counts, the quote and my
 * reminders, then follow-ups and leads (most urgent first), the pipeline by
 * stage, site visits on a map, and wins this month.
 */
export function SalesHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, can } = useUser();
  const { data, error, refreshing, refresh, reload } = useResource<SalesDashboardData>('/dashboards/sales');
  // Revenue is the total of sales orders, which only exist with the operations modules on.
  const config = useResource<{ operationsEnabled: boolean }>('/config');
  const showRevenue = data?.revenueThisMonth != null && config.data?.operationsEnabled === true;
  const [tab, setTab] = useState<Tab>('today');
  const [account, setAccount] = useState(false);
  const [visiting, setVisiting] = useState(false);
  useCallSync();

  const sections = useMemo(() => salesSections(data?.open ?? []), [data]);
  const counts = data ? salesCounts(data) : null;
  const won = useMemo(() => (data?.closedThisMonth ?? []).filter((l) => l.status === 'WON'), [data]);
  const canVisit = can('sitevisit.write');

  const header = (
    <>
      <LinearGradient colors={[colors.navy950, colors.ocean]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text style={styles.greeting}>Hi {user.fullName.split(/\s+/)[0]}</Text>
            <Text style={styles.heroSub}>
              {counts ? `${counts.overdue + counts.dueToday} follow-ups to do today${data && data.handedToday > 0 ? ` · ${data.handedToday} new from telecallers` : ''}` : 'Your leads, follow-ups and site visits'}
            </Text>
          </View>
          <NotificationBell />
          <Pressable testID="account" onPress={() => setAccount(true)} style={styles.accountButton} accessibilityRole="button" accessibilityLabel="Account">
            <Ionicons name="person-circle-outline" size={32} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.tiles}>
          <Tile value={counts?.open} label="My leads" />
          <Tile value={counts?.dueToday} label="Due today" />
          <Tile value={counts?.overdue} label="Overdue" alert={(counts?.overdue ?? 0) > 0} />
          <Tile value={counts?.wonThisMonth} label="Won (month)" />
        </View>
        {data && (
          <Text style={styles.hints}>
            {data.pipeline.QUALIFIED} qualified · {data.pipeline.QUOTED} quoted · {data.pipeline.WON} won in total
          </Text>
        )}
        <View style={styles.heroButtons}>
          {canVisit && (
            <Pressable testID="im-at-site" onPress={() => setVisiting(true)} style={({ pressed }) => [styles.siteButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityHint="Records one GPS reading on one of your leads">
              <Ionicons name="navigate" size={20} color={colors.navy950} />
              <Text style={styles.siteText}>I&apos;m at site</Text>
            </Pressable>
          )}
          <Pressable testID="all-leads-button" onPress={() => router.push('/leads')} style={({ pressed }) => [styles.allLeads, pressed && styles.pressed]} accessibilityRole="button">
            <Ionicons name="list" size={20} color="#FFFFFF" />
            <Text style={styles.allLeadsText}>All my leads</Text>
          </Pressable>
        </View>
      </LinearGradient>
      <Tabs tab={tab} onChange={setTab} counts={{ today: counts ? counts.overdue + counts.dueToday : undefined, visits: data?.visits.length, won: won.length }} />
      {error && (
        <View style={styles.pad}>
          <ErrorBanner message={error} />
        </View>
      )}
    </>
  );

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.blue]} progressViewOffset={insets.top} />;
  const loading = (
    <View style={styles.loading}>
      {error ? <Button label="Try again" onPress={reload} /> : <Centered />}
    </View>
  );
  const empty = (icon: 'checkmark-circle-outline' | 'location-outline' | 'trophy-outline', text: string) =>
    data ? (
      <Centered>
        <Ionicons name={icon} size={44} color={colors.ink3} />
        <Text style={styles.empty}>{text}</Text>
      </Centered>
    ) : (
      loading
    );

  let list: ReactElement;
  if (tab === 'today') {
    list = (
      <SectionList
        testID="sales-leads"
        sections={sections}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={
          <>
            {header}
            <ShortcutRow />
            <DailyQuoteCard />
            <RemindersCard />
          </>
        }
        stickySectionHeadersEnabled={false}
        refreshControl={refreshControl}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.section, { color: BUCKET_COLOR[section.bucket] }]}>
            {section.title} · {section.data.length}
          </Text>
        )}
        renderItem={({ item }) => <SalesCard lead={item} onChanged={reload} />}
        ListEmptyComponent={empty('checkmark-circle-outline', 'No open leads yet. Leads that telecallers hand over to you appear here.')}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      />
    );
  } else if (tab === 'pipeline') {
    const rows = (data?.stages ?? []).map((st) => ({ id: st.id, name: st.name, isActive: st.isActive, count: st.leads }));
    list = (
      <FlatList
        testID="sales-pipeline"
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <>
            {header}
            {data ? (
              <PipelineCard
                title="My pipeline"
                subtitle={`${data.pipeline.QUALIFIED + data.pipeline.QUOTED} open deals · tap a stage to see its leads`}
                rows={rows}
                extra={[
                  { key: 'won', label: 'Won this month', count: data.pipeline.wonThisMonth, tone: 'good', status: 'WON' },
                  { key: 'lost', label: 'Lost this month', count: data.pipeline.lostThisMonth, tone: 'muted', status: 'LOST' },
                ]}
              />
            ) : (
              loading
            )}
          </>
        }
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      />
    );
  } else if (tab === 'visits') {
    list = (
      <FlatList
        testID="sales-visits"
        data={data?.visits ?? []}
        keyExtractor={(v) => v.id}
        ListHeaderComponent={
          <>
            {header}
            {data && <VisitsMap visits={data.visits} />}
            {data && data.visits.length > 0 && <Text style={[styles.section, { color: colors.blue }]}>Your recent site visits</Text>}
          </>
        }
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <View style={styles.rowCard}>
            <VisitRow visit={item} onOpenLead={item.lead ? () => router.push(`/lead/${item.lead!.id}`) : undefined} />
          </View>
        )}
        ListEmptyComponent={empty('location-outline', "No site visits yet. At a customer's site, tap \"I'm at site\" to record where and when.")}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      />
    );
  } else {
    list = (
      <FlatList
        testID="sales-won"
        data={won}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={
          <>
            {header}
            {data && (
              <View style={styles.wonSummary}>
                {showRevenue && (
                  <View style={styles.revenue}>
                    <Text style={styles.revenueLabel}>My revenue this month</Text>
                    <Text testID="revenue" style={styles.revenueValue}>
                      {formatRupees(data.revenueThisMonth!)}
                    </Text>
                    <Text style={styles.revenueNote}>From your sales orders this month</Text>
                  </View>
                )}
                <View style={styles.wonStats}>
                  <View style={styles.wonStat}>
                    <Text style={styles.wonValue}>{data.pipeline.wonThisMonth}</Text>
                    <Text style={styles.wonLabel}>Won this month</Text>
                  </View>
                  <View style={styles.wonStat}>
                    <Text style={styles.wonValue}>{data.pipeline.WON}</Text>
                    <Text style={styles.wonLabel}>Won in total</Text>
                  </View>
                  <View style={styles.wonStat}>
                    <Text style={styles.wonValue}>{data.pipeline.lostThisMonth}</Text>
                    <Text style={styles.wonLabel}>Lost this month</Text>
                  </View>
                </View>
              </View>
            )}
            {won.length > 0 && <Text style={[styles.section, { color: colors.green }]}>Won this month</Text>}
          </>
        }
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <Pressable testID={`won-${item.name}`} onPress={() => router.push(`/lead/${item.id}`)} style={({ pressed }) => [styles.rowCard, styles.wonRow, pressed && styles.pressed]} accessibilityRole="button">
            <Ionicons name="trophy" size={22} color={colors.green} />
            <View style={styles.flex}>
              <Text style={styles.wonName}>{item.name}</Text>
              <Text style={styles.details}>{[productLabel(item), item.city].filter(Boolean).join(' · ') || 'Won'}</Text>
            </View>
            {item.closedAt && <Text style={styles.wonDate}>{formatDay(item.closedAt)}</Text>}
          </Pressable>
        )}
        ListEmptyComponent={empty('trophy-outline', 'No deals won yet this month. Move a lead to Won from its page.')}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      />
    );
  }

  return (
    <View style={styles.page}>
      <StatusBar style="light" />
      {list}
      {visiting && (
        <SiteVisitSheet
          onClose={() => setVisiting(false)}
          onDone={() => {
            setVisiting(false);
            setTab('visits');
            reload();
          }}
        />
      )}
      {account && <AccountSheet onClose={() => setAccount(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 12, paddingTop: 8 },
  loading: { paddingTop: 64 },
  pressed: { opacity: 0.85 },
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
  heroButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  siteButton: { flex: 1.3, minHeight: space.tapLarge, borderRadius: space.radius, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  allLeads: { flex: 1, minHeight: space.tapLarge, borderRadius: space.radius, borderWidth: 1.5, borderColor: '#FFFFFF66', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  allLeadsText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  siteText: { fontSize: 17, fontWeight: '700', color: colors.navy950 },
  tabs: { flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 12, padding: 4, borderRadius: 14, backgroundColor: '#E2E8F3' },
  tab: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.ink2 },
  tabTextOn: { color: colors.blue, fontWeight: '700' },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, marginHorizontal: 12, marginBottom: 10 },
  cardOverdue: { borderColor: colors.redLine },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 18, fontWeight: '700', color: colors.ink },
  details: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  followUp: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rowCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 4, marginHorizontal: 12, marginBottom: 10 },
  empty: { marginTop: 10, fontSize: 15, color: colors.ink2, textAlign: 'center' },
  wonSummary: { marginHorizontal: 12, marginTop: 12, gap: 10 },
  revenue: { backgroundColor: colors.greenLight, borderColor: colors.greenLine, borderWidth: 1, borderRadius: 14, padding: 16 },
  revenueLabel: { fontSize: 13, fontWeight: '700', color: colors.green, textTransform: 'uppercase', letterSpacing: 0.5 },
  revenueValue: { fontSize: 30, fontWeight: '800', color: colors.ink, marginTop: 4, fontVariant: ['tabular-nums'] },
  revenueNote: { fontSize: 13, color: colors.ink2, marginTop: 2 },
  wonStats: { flexDirection: 'row', gap: 8 },
  wonStat: { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingVertical: 12, alignItems: 'center' },
  wonValue: { fontSize: 22, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  wonLabel: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  wonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  wonName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  wonDate: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
});
