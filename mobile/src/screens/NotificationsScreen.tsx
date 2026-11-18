import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Centered, ErrorBanner } from '../components/ui';
import type { NotificationFeed, NotificationItem } from '../lib/followups';
import { formatDateTime } from '../lib/workflow';
import { useSession } from '../session';
import { colors, space } from '../theme';
import { useResource } from '../use-resource';

const ICON: Record<NotificationItem['type'], 'alarm-outline' | 'person-add-outline' | 'swap-horizontal-outline' | 'chatbubbles-outline'> = {
  FOLLOW_UP_DUE: 'alarm-outline',
  LEAD_ASSIGNED: 'person-add-outline',
  LEAD_HANDED_OVER: 'swap-horizontal-outline',
  NOTE_ADDED: 'chatbubbles-outline',
};

/** The web's notification bell, as a screen: reminders (follow-ups due or overdue) and updates (leads assigned or handed to you, shared notes on your leads). */
export function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const { data, error, refreshing, refresh, reload } = useResource<NotificationFeed>('/notifications');
  const [busy, setBusy] = useState(false);

  async function openItem(item: NotificationItem) {
    if (!item.readAt) await api(`/notifications/${item.id}/read`, { method: 'POST' }).catch(() => undefined);
    if (item.lead) router.push(`/lead/${item.lead.id}`);
    else reload();
  }

  async function readAll() {
    setBusy(true);
    await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
    setBusy(false);
    reload();
  }

  const sections = data
    ? [
        { key: 'reminders', title: 'Reminders', data: data.reminders },
        { key: 'updates', title: 'Updates', data: data.updates },
      ].filter((s) => s.data.length > 0)
    : [];

  return (
    <View style={styles.page}>
      <Stack.Screen
        options={{
          title: data && data.unread > 0 ? `Notifications · ${data.unread} new` : 'Notifications',
          headerRight: () =>
            data && data.unread > 0 ? (
              <Pressable testID="read-all" onPress={readAll} disabled={busy} style={styles.headerButton} accessibilityRole="button">
                <Text style={styles.headerText}>Mark all read</Text>
              </Pressable>
            ) : null,
        }}
      />
      <ErrorBanner message={error} />
      {!data && !error ? (
        <Centered />
      ) : (
        <SectionList
          testID="notifications"
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.blue]} />}
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          renderItem={({ item }) => {
            const unread = !item.readAt;
            const late = item.type === 'FOLLOW_UP_DUE' && item.overdue;
            return (
              <Pressable testID={`note-${item.title}`} onPress={() => void openItem(item)} style={({ pressed }) => [styles.row, unread && styles.unread, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${unread ? 'New: ' : ''}${item.title}`}>
                <Ionicons name={ICON[item.type] ?? 'notifications-outline'} size={22} color={late ? colors.red : colors.blue} />
                <View style={styles.flex}>
                  <Text style={[styles.title, unread && styles.titleUnread]}>{item.title}</Text>
                  {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
                  <Text style={[styles.meta, late && styles.late]}>
                    {item.followUp ? `${late ? 'Was due' : 'Due'} ${formatDateTime(item.followUp.scheduledAt)}` : formatDateTime(item.createdAt)}
                  </Text>
                </View>
                {unread && <View style={styles.dot} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No notifications. You&apos;re all caught up.</Text>}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        />
      )}
    </View>
  );
}

/** Bell with the unread count, for the home screens' hero. */
export function NotificationBell() {
  const router = useRouter();
  const { data } = useResource<NotificationFeed>('/notifications');
  const unread = data?.unread ?? 0;
  return (
    <Pressable testID="bell" onPress={() => router.push('/notifications')} style={styles.bell} accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} new` : 'Notifications'}>
      <Ionicons name="notifications-outline" size={28} color="#FFFFFF" />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  headerButton: { minHeight: space.tap, justifyContent: 'center', paddingHorizontal: 8 },
  headerText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.ink2, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 12, marginBottom: 8 },
  unread: { borderColor: colors.blue, backgroundColor: '#F7FAFF' },
  title: { fontSize: 15, fontWeight: '600', color: colors.ink },
  titleUnread: { fontWeight: '800' },
  body: { fontSize: 14, color: colors.ink2, marginTop: 2 },
  meta: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  late: { color: colors.red, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue },
  empty: { fontSize: 15, color: colors.ink2, textAlign: 'center', marginTop: 40 },
  bell: { width: space.tap, height: space.tap, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.navy950 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
