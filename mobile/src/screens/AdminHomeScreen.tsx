import { Ionicons } from '@expo/vector-icons';
import { ConstructionCard } from '../components/construction';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DailyQuoteCard } from '../components/dashboard-cards';
import { HeroButton, heroStyles, HomeHero, SectionHead, Tile } from '../components/home-hero';
import { PeriodReportCard } from '../components/period-report-card';
import { ErrorBanner } from '../components/ui';
import { attentionLink, type MasterSummary } from '../lib/admin';
import { useUser } from '../session';
import { colors, space } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';

const SHOWN = 6;

/**
 * The admin's Home: the web master dashboard for the phone. Today's team
 * numbers, who needs attention (tap one for that person's leads), and the
 * team's results for a date range. Setup (users, permissions, stages,
 * templates, files) stays on the web.
 */
export function AdminHomeScreen() {
  const router = useRouter();
  const pad = useBottomPad();
  const { can } = useUser();
  const { data, error, refreshing, refresh } = useResource<MasterSummary>('/dashboards/master');
  const t = data?.team;
  const flags = data?.flags ?? [];

  return (
    <ScrollView testID="home" style={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.blue]} />} contentContainerStyle={{ paddingBottom: pad }}>
      <HomeHero
        subtitle={t ? `${t.incomingToday} new leads today · ${t.overdue} overdue` : "Today's team numbers"}
        tiles={
          <>
            <Tile value={t?.incomingToday} label="New today" />
            <Tile value={t?.callsToday} label="Calls today" />
            <Tile value={t?.notCalled} label="Not called" alert={(t?.notCalled ?? 0) > 0} />
            <Tile value={t?.overdue} label="Overdue" alert={(t?.overdue ?? 0) > 0} />
          </>
        }
        hints={t ? `${t.qualifiedToday} qualified today · ${t.wonMonth} won this month` : null}
      >
        {(can('leads.quick_add') || can('leads.write')) && (
          <View style={heroStyles.buttons}>
            {can('leads.quick_add') && <HeroButton testID="go-quick-add" primary label="Quick add" icon="flash" onPress={() => router.push('/new-lead')} />}
            {can('leads.write') && <HeroButton testID="go-all-leads" label="All leads" icon="people" onPress={() => router.navigate('/my-leads')} />}
          </View>
        )}
      </HomeHero>
      {error && (
        <View style={styles.pad}>
          <ErrorBanner message={error} />
        </View>
      )}
      <DailyQuoteCard />
      <ConstructionCard data={data?.overview?.pipeline?.construction} title="Open leads by construction stage" />

      {data && (
        <>
          <SectionHead title={flags.length ? `Needs attention · ${flags.length}` : 'Needs attention'} color={flags.length ? colors.red : colors.green} />
          <View style={styles.card} testID="attention">
            {flags.length === 0 && <Text style={styles.none}>Nobody is slipping. All new leads called and follow-ups on time.</Text>}
            {flags.slice(0, SHOWN).map((f) => (
              <Pressable
                key={`${f.personId}-${f.message}`}
                onPress={() => router.push(attentionLink(f))}
                style={({ pressed }) => [styles.flag, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityHint={`Opens ${f.person}'s leads`}
              >
                <Ionicons name={f.severity === 'high' ? 'alert-circle' : 'time-outline'} size={22} color={f.severity === 'high' ? colors.red : colors.amber} />
                <View style={styles.flex}>
                  <Text style={styles.person}>
                    {f.person}
                    <Text style={styles.role}> · {f.role}</Text>
                  </Text>
                  <Text style={[styles.message, { color: f.severity === 'high' ? colors.red : colors.amber }]}>{f.message}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
              </Pressable>
            ))}
            {flags.length > SHOWN && <Text style={styles.more}>+{flags.length - SHOWN} more on the web dashboard</Text>}
          </View>
        </>
      )}

      <PeriodReportCard title="Team results" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 12, paddingTop: 8 },
  pressed: { opacity: 0.85 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginHorizontal: 12, overflow: 'hidden' },
  none: { fontSize: 14, color: colors.ink2, padding: 14 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: space.tapLarge + 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  person: { fontSize: 15, fontWeight: '700', color: colors.ink },
  role: { fontWeight: '400', color: colors.ink3 },
  message: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  more: { fontSize: 13, color: colors.ink3, padding: 12, textAlign: 'center' },
});
