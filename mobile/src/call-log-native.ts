// The app's own Android module (modules/call-log). Absent in Expo Go or on another platform: then nothing is read.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { CallLogRead } from './lib/call-sync';

interface CallLogNative {
  readMatching(sinceMs: number, numberKeys: string[], limit: number): Promise<CallLogRead>;
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<CallLogNative>('PreconCallLog') : null;

export const callLogAvailable = native !== null;

export async function readCallLog(sinceMs: number, numberKeys: string[], limit: number): Promise<CallLogRead> {
  return native ? native.readMatching(sinceMs, numberKeys, limit) : { calls: [], truncated: false };
}
