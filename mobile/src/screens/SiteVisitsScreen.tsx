import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { VisitsMap } from '../components/dashboard-cards';
import { SiteVisitSheet, VisitRow } from '../components/site-visit';
import { Button, Centered, ErrorBanner } from '../components/ui';
import type { SalesDashboardData } from '../lib/sales';
import { useUser } from '../session';
import { colors } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';
import { salesStyles } from './SalesLeadsScreen';

/**
 * Site Visits (sales tab): "I'm at site" (one GPS reading on one of my leads),
 * then my recent visits as pins on an OpenStreetMap map and as a list.
 */
export function SiteVisitsScreen() {
  const router = useRouter();
  const pad = useBottomPad();
  const { can } = useUser();
  const canVisit = can('sitevisit.write');
  // Admins see the whole team's visits (last 30 days); a salesperson their own.
  const team = can('leads.read_all');
  const { data, error, refreshing, refresh, reload } = useResource<Pick<SalesDashboardData, 'visits'>>(team ? '/dashboards/master' : '/dashboards/sales');
  const [visiting, setVisiting] = useState(false);
  const visits = data?.visits ?? [];

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: team ? 'Team site visits' : 'Site visits' }} />
      <FlatList
        testID="sales-visits"
        data={visits}
        keyExtractor={(v) => v.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.blue]} />}
        ListHeaderComponent={
          <>
            {canVisit && (
              <View style={styles.checkIn}>
                <Button testID="im-at-site" label="I'm at site" icon="navigate" onPress={() => setVisiting(true)} style={styles.big} accessibilityHint="Records one GPS reading on one of your leads" />
                <Text style={styles.note}>Takes one location reading, only when you tap. You are never tracked.</Text>
              </View>
            )}
            {error && (
              <View style={styles.pad}>
                <ErrorBanner message={error} />
              </View>
            )}
            {data && <VisitsMap visits={visits} height={280} />}
            {visits.length > 0 && <Text style={[salesStyles.section, { color: colors.blue }]}>{team ? 'Last 30 days' : 'Your recent site visits'} · {visits.length}</Text>}
          </>
        }
        renderItem={({ item }) => (
          <View style={salesStyles.rowCard}>
            <VisitRow visit={item} showPerson={team} onOpenLead={item.lead ? () => router.push(`/lead/${item.lead!.id}`) : undefined} />
          </View>
        )}
        ListEmptyComponent={
          data ? (
            <Centered>
              <Ionicons name="location-outline" size={44} color={colors.ink3} />
              <Text style={salesStyles.empty}>No site visits yet. At a customer&apos;s site, tap &quot;I&apos;m at site&quot; to record where and when.</Text>
            </Centered>
          ) : (
            <View style={salesStyles.loading}>{error ? <Button label="Try again" onPress={reload} /> : <Centered />}</View>
          )
        }
        contentContainerStyle={{ paddingBottom: pad }}
      />
      {visiting && (
        <SiteVisitSheet
          onClose={() => setVisiting(false)}
          onDone={() => {
            setVisiting(false);
            reload();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  pad: { paddingHorizontal: 12, paddingTop: 8 },
  checkIn: { marginHorizontal: 12, marginTop: 12 },
  big: { minHeight: 60 },
  note: { fontSize: 13, color: colors.ink3, textAlign: 'center', marginTop: 8 },
});
