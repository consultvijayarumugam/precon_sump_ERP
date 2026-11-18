import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { DailyQuoteCard, PipelineCard, RemindersCard } from '../components/dashboard-cards';
import { HeroButton, heroStyles, HomeHero, SectionHead, Tile } from '../components/home-hero';
import { PeriodReportCard } from '../components/period-report-card';
import { ErrorBanner } from '../components/ui';
import { pipelineRows, type LeadsSummary } from '../lib/dashboard';
import type { PipelineStage } from '../lib/sales';
import { toSections, type TelecallerData } from '../lib/workflow';
import { useUser } from '../session';
import { colors } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';
import { BUCKET_COLOR, WorkCard } from './WorklistScreen';

const PREVIEW = 3;

/**
 * The telecaller's Home tab, their web dashboard on the phone: today's
 * counts, the thought for today, my reminders, the next few people to call,
 * and my pipeline. The full call list is the My Leads tab.
 */
export function TelecallerHomeScreen() {
  const router = useRouter();
  const pad = useBottomPad();
  const { can } = useUser();
  const canAdd = can('leads.write') || can('leads.quick_add');
  const { data, error, refreshing, refresh, reload } = useResource<TelecallerData>('/dashboards/telecaller');
  const summary = useResource<LeadsSummary>('/leads/summary');
  const stages = useResource<PipelineStage[]>('/pipeline-stages');
  const sections = useMemo(() => toSections(data?.items ?? []), [data]);
  const next = useMemo(() => sections.flatMap((s) => s.data.map((item) => ({ item, bucket: s.bucket }))).slice(0, PREVIEW), [sections]);
  const pipeline = useMemo(() => (summary.data && stages.data ? pipelineRows(stages.data, summary.data.leadsByStage) : null), [summary.data, stages.data]);
  const c = data?.counts;
  const refreshAll = () => {
    refresh();
    summary.reload();
    stages.reload();
  };

  return (
    <ScrollView testID="home" style={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} colors={[colors.blue]} />} contentContainerStyle={{ paddingBottom: pad }}>
      <HomeHero
        subtitle={c ? `${c.overdue + c.callbacksDueToday + c.notCalledYet} leads to call now` : 'Your calls for today'}
        tiles={
          <>
            <Tile testID="tile-new" value={c?.newToday} label="New today" />
            <Tile value={c?.callbacksDueToday} label="Due today" />
            <Tile value={c?.overdue} label="Overdue" alert={(c?.overdue ?? 0) > 0} />
            <Tile value={c?.callsToday} label="Calls today" />
          </>
        }
        hints={c ? `${c.notCalledYet} not called yet · ${c.callsThisWeek} calls this week · ${c.qualifiedToday} qualified today` : null}
      >
        <View style={heroStyles.buttons}>
          <HeroButton testID="start-calling" primary label="Start calling" icon="call" onPress={() => router.navigate('/my-leads')} />
          {canAdd && <HeroButton testID="go-new-lead" label="New lead" icon="person-add" onPress={() => router.push('/new-lead')} />}
        </View>
      </HomeHero>
      {error && (
        <View style={styles.pad}>
          <ErrorBanner message={error} />
        </View>
      )}
      <DailyQuoteCard />
      <RemindersCard />
      <PeriodReportCard title="My results" />
      {next.length > 0 && (
        <>
          <SectionHead title="Call next" color={BUCKET_COLOR[next[0].bucket]} action={`All ${data?.items.length ?? ''}`} onAction={() => router.navigate('/my-leads')} testID="see-all-leads" />
          {next.map(({ item }) => (
            <WorkCard key={item.id} item={item} onChanged={reload} />
          ))}
        </>
      )}
      {pipeline && <PipelineCard title="My pipeline" subtitle={summary.data ? `${summary.data.openLeads} open of ${summary.data.totalLeads} leads · tap a stage to see its leads` : undefined} rows={pipeline} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  pad: { paddingHorizontal: 12, paddingTop: 8 },
});
