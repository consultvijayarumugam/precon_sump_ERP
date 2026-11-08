// Saved on the device with expo-secure-store (Android Keystore-backed encryption).
import * as SecureStore from 'expo-secure-store';
import { normalizeApiUrl } from './lib/api-url';

const TOKEN_KEY = 'precon.accessToken';
const API_URL_KEY = 'precon.apiUrl';

/** Built into the app from EXPO_PUBLIC_API_URL in mobile/.env; the login screen can override it. */
export const BUILT_IN_API_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL ?? '') ?? 'http://10.0.2.2:4000/api/v1';

export const getToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const saveToken = (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const clearToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

export async function getApiUrl() {
  return (await SecureStore.getItemAsync(API_URL_KEY)) ?? BUILT_IN_API_URL;
}
export const saveApiUrl = (url: string) => SecureStore.setItemAsync(API_URL_KEY, url);
