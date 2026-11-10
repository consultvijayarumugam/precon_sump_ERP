import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ComponentProps, useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CallPermission, checkCallPermission, openAppSettings, requestCallPermission } from '../call-permission';
import { getSyncState, syncCalls } from '../call-sync';
import { Button, Centered } from '../components/ui';
import { formatDateTime } from '../lib/workflow';
import { useSession, useUser } from '../session';
import { colors } from '../theme';

function Point({ icon, color, children }: { icon: ComponentProps<typeof Ionicons>['name']; color: string; children: string }) {
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={20} color={color} style={styles.pointIcon} />
      <Text style={styles.pointText}>{children}</Text>
    </View>
  );
}

function Explanation() {
  return (
    <View style={styles.card}>
      <Text style={styles.subheading}>What the app reads</Text>
      <Point icon="checkmark-circle" color={colors.green}>Only calls to or from your leads</Point>
      <Point icon="checkmark-circle" color={colors.green}>The number, incoming or outgoing, the start time and how long the call lasted</Point>
      <Text style={[styles.subheading, styles.gap]}>What it never reads</Text>
      <Point icon="close-circle" color={colors.red}>Personal calls, or anyone who isn&apos;t one of your leads</Point>
      <Point icon="close-circle" color={colors.red}>Older calls from before you turn this on</Point>
      <Point icon="close-circle" color={colors.red}>What was said: the app doesn&apos;t record calls</Point>
      <Text style={styles.small}>Your manager can see your total talk-time and number of calls. You can turn this off any time in your phone&apos;s Settings.</Text>
    </View>
  );
}

/** Explains why the app wants the call log, asks for it, and shows where things stand. */
export function CallTrackingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { api } = useSession();
  const { user } = useUser();
  const [permission, setPermission] = useState<CallPermission | null>(null);
  const [justRefused, setJustRefused] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setPermission(await checkCallPermission());
    setLastSync((await getSyncState(user.id))?.lastSyncAt ?? null);
  }, [user.id]);

  useEffect(() => {
    void refresh();
    // Coming back from Settings: the answer may have changed.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const sync = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const result = await syncCalls(api, user.id);
    if (result.status === 'failed') setMessage(`Couldn't reach the server. Your calls are safe on this phone and will be sent automatically. (${result.message})`);
    else if (result.status === 'done') setMessage(result.stored > 0 ? `Sent ${result.stored} new call${result.stored === 1 ? '' : 's'}.` : 'Up to date.');
    await refresh();
    setBusy(false);
  }, [api, user.id, refresh]);

  async function allow() {
    setBusy(true);
    const result = await requestCallPermission();
    setPermission(result);
    setJustRefused(result !== 'granted');
    setBusy(false);
    if (result === 'granted') await sync();
  }

  if (permission === null) return <Centered />;

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 20 }]}>
      {permission === 'granted' ? (
        <>
          <Ionicons name="checkmark-circle" size={56} color={colors.green} style={styles.icon} />
          <Text testID="tracking-status" style={styles.heading}>Call tracking is on</Text>
          <Text style={styles.body}>{lastSync ? `Last synced ${formatDateTime(new Date(lastSync))}` : 'Your calls will sync automatically.'}</Text>
          {message && <Text testID="sync-message" style={styles.message}>{message}</Text>}
          <Button testID="sync-now" label="Sync now" icon="sync-outline" onPress={sync} busy={busy} style={styles.button} />
          <Explanation />
        </>
      ) : permission === 'unavailable' ? (
        <>
          <Ionicons name="alert-circle-outline" size={56} color={colors.ink3} style={styles.icon} />
          <Text testID="tracking-status" style={styles.heading}>Call tracking isn&apos;t available</Text>
          <Text style={styles.body}>This version of the app can&apos;t read the phone&apos;s call log. Everything else works, and you can keep logging calls by hand.</Text>
        </>
      ) : (
        <>
          <Ionicons name="call-outline" size={56} color={colors.blue} style={styles.icon} />
          <Text testID="tracking-status" style={styles.heading}>{permission === 'blocked' ? 'Call tracking is turned off' : 'Count your talk-time automatically'}</Text>
          <Text style={styles.body}>
            With your permission, the app records how long your calls with leads last, so your work is counted without typing it in.
          </Text>
          <Explanation />
          {justRefused && permission === 'denied' && (
            <Text testID="refused" style={styles.message}>No problem. The app keeps working and you can log calls by hand.</Text>
          )}
          {permission === 'blocked' ? (
            <>
              <Text testID="blocked-help" style={styles.message}>
                Android won&apos;t ask again, so this has to be turned on in Settings: open Permissions, then Call logs, then Allow. If it says &quot;Restricted setting&quot;, tap the ⋮ menu at the top of the app&apos;s info page, choose &quot;Allow restricted settings&quot;, then try again.
              </Text>
              <Button testID="open-settings" label="Open Settings" icon="settings-outline" onPress={() => void openAppSettings()} style={styles.button} />
            </>
          ) : (
            <Button testID="allow-tracking" label="Allow call tracking" icon="checkmark" onPress={allow} busy={busy} style={styles.button} />
          )}
          <Button testID="not-now" label="Not now" tone="secondary" onPress={() => router.back()} style={styles.button} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: 18 },
  icon: { alignSelf: 'center', marginTop: 6, marginBottom: 8 },
  heading: { fontSize: 23, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink2, textAlign: 'center', marginTop: 8, marginBottom: 14 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, marginTop: 4 },
  subheading: { fontSize: 14, fontWeight: '700', color: colors.navy900, marginBottom: 8 },
  gap: { marginTop: 12 },
  point: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  pointIcon: { marginTop: 1 },
  pointText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.ink },
  small: { fontSize: 13, lineHeight: 19, color: colors.ink3, marginTop: 6 },
  message: { fontSize: 14, lineHeight: 20, color: colors.ink2, marginTop: 14, textAlign: 'center' },
  button: { marginTop: 12 },
});
