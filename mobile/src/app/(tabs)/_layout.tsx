import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReminderSummary } from '../../lib/dashboard';
import type { NotificationFeed } from '../../lib/followups';
import { appRole, badge, tabLabel, tabVisible, type TabKey } from '../../lib/tabs';
import { NotificationBell } from '../../screens/NotificationsScreen';
import { useUser } from '../../session';
import { colors } from '../../theme';
import { IncomingCallPrompts } from '../../components/incoming-call-prompt';
import { useCallSync } from '../../use-call-sync';
import { useResource } from '../../use-resource';

type Icon = keyof typeof Ionicons.glyphMap;

/**
 * The bottom tab bar. Telecallers: Home, My Leads, Callbacks, Calendar, More.
 * Sales: Home, My Leads, Pipeline, Site Visits, More. Admin: Home, Leads,
 * Follow-ups, Site Visits, More. A lead, the searchable
 * list, New lead and the other full screens open above the tabs.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const role = appRole(user.role.key);
  // The people who call leads: their work calls keep syncing whichever tab is open.
  const calls = role === 'telecaller' || role === 'sales';
  useCallSync(calls);
  const reminders = useResource<ReminderSummary>(calls ? '/notifications/summary' : null);
  const feed = useResource<NotificationFeed>('/notifications');
  const due = reminders.data ? reminders.data.overdue.length + reminders.data.dueToday.length : 0;

  const tab = (name: TabKey, title: string, icon: Icon, extra: { badge?: number | string; header?: boolean } = {}) => (
    <Tabs.Screen
      name={name}
      options={{
        title,
        href: tabVisible(role, name) ? undefined : null,
        tabBarButtonTestID: `tab-${name}`,
        tabBarLabel: title, // fixed, whatever title the screen sets for its header
        tabBarAccessibilityLabel: title,
        tabBarBadge: extra.badge,
        headerShown: extra.header ?? true,
        tabBarIcon: ({ color, focused }) => <Ionicons name={(focused ? icon : `${icon}-outline`) as Icon} size={24} color={color as string} />,
      }}
      // Pull the badges' counts fresh whenever a tab is tapped.
      listeners={{
        tabPress: () => {
          reminders.reload();
          feed.reload();
        },
      }}
    />
  );

  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy900 },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '700' },
          headerRight: () => <NotificationBell />,
          headerRightContainerStyle: styles.headerRight,
          sceneStyle: { backgroundColor: colors.surface },
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.ink3,
          tabBarLabelStyle: styles.label,
          tabBarStyle: [styles.bar, { height: 64 + insets.bottom, paddingBottom: insets.bottom + 6 }],
          tabBarItemStyle: styles.item,
          tabBarBadgeStyle: styles.badge,
          tabBarHideOnKeyboard: true,
        }}
      >
        {tab('index', tabLabel(role, 'index'), 'home', { header: false })}
        {tab('my-leads', tabLabel(role, 'my-leads'), 'people', { badge: role === 'sales' ? badge(due) : undefined })}
        {tab('callbacks', tabLabel(role, 'callbacks'), 'alarm', { badge: role === 'telecaller' ? badge(due) : undefined })}
        {tab('schedule', tabLabel(role, 'schedule'), 'calendar')}
        {tab('pipeline', tabLabel(role, 'pipeline'), 'git-commit')}
        {tab('visits', tabLabel(role, 'visits'), 'location')}
        {tab('more', tabLabel(role, 'more'), 'grid', { badge: badge(feed.data?.unread) })}
      </Tabs>
      {/* "How did the call go?" for answered incoming calls from your leads, found by call sync. */}
      {calls && <IncomingCallPrompts />}
    </>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.card, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, elevation: 12 },
  item: { minHeight: 52 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  badge: { backgroundColor: '#DC2626', color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  headerRight: { paddingRight: 4 },
});
