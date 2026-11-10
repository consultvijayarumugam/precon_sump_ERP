// Android's READ_CALL_LOG permission. Nothing here throws: a refusal just means no automatic tracking.
import * as SecureStore from 'expo-secure-store';
import { Linking, PermissionsAndroid } from 'react-native';
import { callLogAvailable } from './call-log-native';

/** unavailable: this build or device can't read a call log. blocked: Android won't ask again, only Settings can change it. */
export type CallPermission = 'unavailable' | 'granted' | 'denied' | 'blocked';

const PERMISSION = PermissionsAndroid.PERMISSIONS.READ_CALL_LOG;
const BLOCKED_KEY = 'precon.callPermission.blocked';
const EXPLAINED_KEY = 'precon.callPermission.explained';

async function setBlocked(blocked: boolean) {
  await (blocked ? SecureStore.setItemAsync(BLOCKED_KEY, '1') : SecureStore.deleteItemAsync(BLOCKED_KEY)).catch(() => undefined);
}

export async function checkCallPermission(): Promise<CallPermission> {
  if (!callLogAvailable) return 'unavailable';
  try {
    if (await PermissionsAndroid.check(PERMISSION)) {
      await setBlocked(false);
      return 'granted';
    }
    return (await SecureStore.getItemAsync(BLOCKED_KEY)) ? 'blocked' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function requestCallPermission(): Promise<CallPermission> {
  if (!callLogAvailable) return 'unavailable';
  try {
    const result = await PermissionsAndroid.request(PERMISSION);
    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      await setBlocked(false);
      return 'granted';
    }
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      await setBlocked(true);
      return 'blocked';
    }
    return 'denied';
  } catch {
    return 'denied';
  }
}

export const openAppSettings = () => Linking.openSettings().catch(() => undefined);

/** True only the first time, so the explanation screen appears once by itself. */
export async function firstTimeExplaining(): Promise<boolean> {
  try {
    if (await SecureStore.getItemAsync(EXPLAINED_KEY)) return false;
    await SecureStore.setItemAsync(EXPLAINED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
