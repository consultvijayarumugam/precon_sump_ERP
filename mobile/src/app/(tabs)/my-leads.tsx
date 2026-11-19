import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LeadsList } from '../../components/leads-list';
import { Chip } from '../../components/ui';
import { appRole } from '../../lib/tabs';
import { SalesLeadsScreen } from '../../screens/SalesLeadsScreen';
import { WorklistScreen } from '../../screens/WorklistScreen';
import { useUser } from '../../session';
import { colors } from '../../theme';
import { useBottomPad } from '../../use-bottom-pad';

type View_ = 'all' | 'queue';

/**
 * My Leads (Leads for admin). Opens on every lead you can see, loaded at once,
 * with search, live stage chips and dates to narrow it. Telecallers and sales
 * can switch to their working order: who to call first / follow-ups first.
 */
export default function MyLeadsTab() {
  const { user } = useUser();
  const role = appRole(user.role.key);
  const pad = useBottomPad();
  const [view, setView] = useState<View_>('all');
  const hasQueue = role === 'telecaller' || role === 'sales';

  const switcher = hasQueue ? (
    <View style={styles.switcher} accessibilityRole="tablist">
      <Chip testID="view-all" label="All my leads" active={view === 'all'} onPress={() => setView('all')} />
      <Chip testID="view-queue" label={role === 'telecaller' ? 'Call order' : 'Follow-up order'} active={view === 'queue'} onPress={() => setView('queue')} />
    </View>
  ) : undefined;

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: role === 'admin' ? 'Leads' : 'My leads' }} />
      {view === 'queue' && role === 'telecaller' ? (
        <WorklistScreen header={switcher} />
      ) : view === 'queue' && role === 'sales' ? (
        <SalesLeadsScreen header={switcher} />
      ) : (
        <LeadsList header={switcher} bottomPad={pad} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  switcher: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
});
