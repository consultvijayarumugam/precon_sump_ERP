import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LeadsList } from '../components/leads-list';
import type { LeadStatus } from '../lib/workflow';
import { useUser } from '../session';
import { colors } from '../theme';

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'WON', 'LOST'];

/**
 * All my leads as a full screen (from a pipeline bar, Won / Lost this month,
 * a "needs attention" line, or More): like the web Leads page. The list
 * itself is LeadsList, the same as the My Leads tab.
 */
export function AllLeadsScreen({ stageId, status, title, assignedToId }: { stageId?: string; status?: string; title?: string; assignedToId?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { can } = useUser();
  const canAdd = can('leads.write') || can('leads.quick_add');
  return (
    <View style={styles.page}>
      <Stack.Screen
        options={{
          title: title ? `Leads: ${title}` : can('leads.read_all') ? 'All leads' : 'All my leads',
          headerRight: canAdd
            ? () => (
                <Pressable testID="add-lead" onPress={() => router.push('/new-lead')} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="New lead">
                  <Ionicons name="add" size={28} color="#FFFFFF" />
                </Pressable>
              )
            : undefined,
        }}
      />
      <LeadsList
        stageId={stageId}
        status={STATUSES.find((s) => s === status)}
        assignedToId={assignedToId}
        bottomPad={insets.bottom + 16}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
