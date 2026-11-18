import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { DailyQuoteCard, RemindersCard } from '../components/dashboard-cards';
import { HeroButton, heroStyles, HomeHero, SectionHead, Tile } from '../components/home-hero';
import { PeriodReportCard } from '../components/period-report-card';
import { SiteVisitSheet } from '../components/site-visit';
import { ErrorBanner } from '../components/ui';
import { salesCounts, salesSections, type SalesDashboardData } from '../lib/sales';
import { useUser } from '../session';
import { colors } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';
import { SALES_BUCKET_COLOR, SalesCard } from './SalesLeadsScreen';

const PREVIEW = 3;

/**
 * The salesperson's Home tab, their web dashboard on the phone: key counts,
 * the quote and my reminders, the follow-ups to do today, and my results
 * for a date range (this month by default). My Leads, Pipeline and Site Visits each have their own tab.
 */
export function SalesHomeScreen() {
  const router = useRouter();
  const pad = useBottomPad();
  const { can } = useUser();
  const { data, error, refreshing, refresh, reload } = useResource<SalesDashboardData>('/dashboards/sales');
  const [visiting, setVisiting] = useState(false);
  const canVisit = can('sitevisit.write');
  const canAdd = can('leads.write') || can('leads.quick_add');
  const counts = data ? salesCounts(data) : null;
  // Today's work: overdue and due-today follow-ups, most urgent first.
  const today = useMemo(
    () =>
      salesSections(data?.open ?? [])
        .filter((s) => s.bucket === 'overdue' || s.bucket === 'today')
        .flatMap((s) => s.data.map((lead) => ({ lead, bucket: s.bucket }))),
    [data],
  );

  return (
    <View style={styles.page}>
      <ScrollView testID="home" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.blue]} />} contentContainerStyle={{ paddingBottom: pad }}>
        <HomeHero
          subtitle={counts ? `${counts.overdue + counts.dueToday} follow-ups to do today${data && data.handedToday > 0 ? ` · ${data.handedToday} new from telecallers` : ''}` : 'Your leads, follow-ups and site visits'}
          tiles={
            <>
              <Tile value={counts?.open} label="My leads" />
              <Tile value={counts?.dueToday} label="Due today" />
              <Tile value={counts?.overdue} label="Overdue" alert={(counts?.overdue ?? 0) > 0} />
              <Tile value={counts?.wonThisMonth} label="Won (month)" />
            </>
          }
          hints={data ? `${data.pipeline.QUALIFIED} qualified · ${data.pipeline.QUOTED} quoted · ${data.pipeline.WON} won in total` : null}
        >
          {(canVisit || canAdd) && (
            <View style={heroStyles.buttons}>
              {canVisit && <HeroButton testID="im-at-site" primary label="I'm at site" icon="navigate" onPress={() => setVisiting(true)} hint="Records one GPS reading on one of your leads" />}
              {canAdd && <HeroButton testID="go-new-lead" label="New lead" icon="person-add" onPress={() => router.push('/new-lead')} />}
            </View>
          )}
        </HomeHero>
        {error && (
          <View style={styles.pad}>
            <ErrorBanner message={error} />
          </View>
        )}
        <DailyQuoteCard />
        <RemindersCard />

        {today.length > 0 && (
          <>
            <SectionHead title="Follow-ups today" color={SALES_BUCKET_COLOR[today[0].bucket]} action={today.length > PREVIEW ? `All ${today.length}` : 'My leads'} onAction={() => router.navigate('/my-leads')} testID="see-all-leads" />
            {today.slice(0, PREVIEW).map(({ lead }) => (
              <SalesCard key={lead.id} lead={lead} onChanged={reload} />
            ))}
          </>
        )}

        <PeriodReportCard title="My results" />
      </ScrollView>
      {visiting && (
        <SiteVisitSheet
          onClose={() => setVisiting(false)}
          onDone={() => {
            setVisiting(false);
            reload();
            router.navigate('/visits');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  pad: { paddingHorizontal: 12, paddingTop: 8 },
});
