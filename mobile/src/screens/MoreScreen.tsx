import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/ui';
import type { NotificationFeed } from '../lib/followups';
import { appRole } from '../lib/tabs';
import { useSession, useUser } from '../session';
import { colors, space } from '../theme';
import { useBottomPad } from '../use-bottom-pad';
import { useResource } from '../use-resource';

type Icon = keyof typeof Ionicons.glyphMap;

function Row({ icon, label, detail, href, count, testID }: { icon: Icon; label: string; detail?: string; href: Href; count?: number; testID: string }) {
  const router = useRouter();
  return (
    <Pressable testID={testID} onPress={() => router.push(href)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={count ? `${label}, ${count} new` : label}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={22} color={colors.blue} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {count ? (
        <View style={styles.count}>
          <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </>
  );
}

/**
 * More: profile, notifications, the screens that aren't a tab for this role
 * (calendar, reports, new lead), call tracking, server, and Log out last.
 * Admin setup (users, permissions, stages, templates, files) stays on the web.
 */
export function MoreScreen() {
  const pad = useBottomPad();
  const { user, apiUrl, can } = useUser();
  const { signOut } = useSession();
  const [leaving, setLeaving] = useState(false);
  const role = appRole(user.role.key);
  const notifications = useResource<NotificationFeed>('/notifications');
  const canAdd = can('leads.write') || can('leads.quick_add');
  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  const logOut = () =>
    Alert.alert('Log out?', 'You will need your email and password to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          void signOut();
        },
      },
    ]);

  return (
    <ScrollView testID="more" style={styles.page} contentContainerStyle={{ paddingBottom: pad }}>
      <Stack.Screen options={{ title: 'More' }} />
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        </View>
        <View style={styles.flex}>
          <Text testID="logged-in" style={styles.name}>
            {user.fullName}
          </Text>
          <Text style={styles.role}>{user.role.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
      </View>

      <Group title="My work">
        <Row testID="more-notifications" icon="notifications-outline" label="Notifications" detail="Reminders and leads handed to you" href="/notifications" count={notifications.data?.unread} />
        {role === 'sales' && <Row testID="go-follow-ups" icon="alarm-outline" label="Follow-ups" detail="Overdue, upcoming and done" href="/follow-ups" />}
        {role !== 'telecaller' && (
          <Row testID="go-calendar" icon="calendar-outline" label="Calendar" detail={role === 'admin' ? "The team's follow-ups by month" : 'Your follow-ups by month'} href="/calendar" />
        )}
        {(can('reports.view') || can('reports.view_all')) && (
          <Row testID="go-reports" icon="bar-chart-outline" label="Reports" detail={role === 'admin' ? 'Leads, telecallers, pipeline, revenue, follow-ups' : 'Your numbers for any dates'} href="/reports" />
        )}
        {canAdd && <Row testID="more-new-lead" icon="person-add-outline" label="New lead" detail={can('leads.quick_add') ? 'Quick add a WhatsApp enquiry, or the full form' : 'Add a lead to your list'} href="/new-lead" />}
      </Group>

      <Group title="Settings">
        {(role === 'telecaller' || role === 'sales') && (
          <Row testID="call-tracking" icon="timer-outline" label="Call tracking" detail="Talk-time from your work calls" href="/call-tracking" />
        )}
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name="server-outline" size={22} color={colors.blue} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.rowLabel}>Server</Text>
            <Text style={styles.rowDetail} selectable>
              {apiUrl}
            </Text>
          </View>
        </View>
      </Group>

      <Button testID="logout" label="Log out" tone="secondary" icon="log-out-outline" onPress={logOut} busy={leaving} style={styles.logout} />
      <Text style={styles.version}>Precon Sump · version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pressed: { backgroundColor: colors.tint },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 16, marginHorizontal: 12, marginTop: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '700', color: colors.ink },
  role: { fontSize: 14, fontWeight: '600', color: colors.blue, marginTop: 1 },
  email: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  groupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.ink2, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  group: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginHorizontal: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.ink },
  rowDetail: { fontSize: 13, color: colors.ink3, marginTop: 1 },
  count: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  logout: { marginHorizontal: 12, marginTop: 24, minHeight: space.tapLarge },
  version: { textAlign: 'center', fontSize: 12, color: colors.ink3, marginTop: 14 },
});
