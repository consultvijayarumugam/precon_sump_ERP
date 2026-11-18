import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReminderSummary } from '../../lib/dashboard';
import type { NotificationFeed } from '../../lib/followups';
import { appRole, badge, tabVisible, type TabKey } from '../../lib/tabs';
import { NotificationBell } from '../../screens/NotificationsScreen';
import { useUser } from '../../session';
import { colors } from '../../theme';
import { IncomingCallPrompts } from '../../components/incoming-call-prompt';
import { useCallSync } from '../../use-call-sync';
import { useResource } from '../../use-resource';

type Icon = keyof typeof Ionicons.glyphMap;

/**
 * The bottom tab bar. Telecallers: Home, My Leads, Callbacks, Calendar, More.
 * Sales: Home, My Leads, Pipeline, Site Visits, More. A lead, the searchable
 * list, New lead and the other full screens open above the tabs.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const role = appRole(user.role.key);
  // Work calls keep syncing to the server whichever tab is open.
  useCallSync(role !== 'other');
  const reminders = useResource<ReminderSummary>(role === 'other' ? null : '/notifications/summary');
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
        {tab('index', 'Home', 'home', { header: false })}
        {tab('my-leads', 'My Leads', 'people', { badge: role === 'sales' ? badge(due) : undefined })}
        {tab('callbacks', 'Callbacks', 'alarm', { badge: badge(due) })}
        {tab('schedule', 'Calendar', 'calendar')}
        {tab('pipeline', 'Pipeline', 'git-commit')}
        {tab('visits', 'Site Visits', 'location')}
        {tab('more', 'More', 'grid', { badge: badge(feed.data?.unread) })}
      </Tabs>
      {/* "How did the call go?" for answered incoming calls from your leads, found by call sync. */}
      {role !== 'other' && <IncomingCallPrompts />}
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
