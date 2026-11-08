import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, fetchMe, logout, User } from './src/api';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { clearToken, getApiUrl, getToken } from './src/storage';
import { colors } from './src/theme';

type State =
  | { screen: 'loading' }
  | { screen: 'login'; apiUrl: string; notice: string | null }
  | { screen: 'home'; user: User; token: string; apiUrl: string }
  | { screen: 'offline'; token: string; apiUrl: string; message: string };

export default function App() {
  const [state, setState] = useState<State>({ screen: 'loading' });

  /** On launch: a saved token is checked against the server before showing Home. */
  const restore = useCallback(async () => {
    setState({ screen: 'loading' });
    const [token, apiUrl] = await Promise.all([getToken(), getApiUrl()]);
    if (!token) return setState({ screen: 'login', apiUrl, notice: null });
    try {
      setState({ screen: 'home', user: await fetchMe(apiUrl, token), token, apiUrl });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearToken();
        setState({ screen: 'login', apiUrl, notice: 'Your session has ended. Please log in again.' });
      } else {
        setState({ screen: 'offline', token, apiUrl, message: err instanceof Error ? err.message : 'Could not reach the server.' });
      }
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  async function signOut(token: string, apiUrl: string) {
    await logout(apiUrl, token).catch(() => undefined); // offline: still sign out on this phone
    await clearToken();
    setState({ screen: 'login', apiUrl, notice: null });
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {state.screen === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      )}
      {state.screen === 'login' && (
        <LoginScreen apiUrl={state.apiUrl} notice={state.notice} onLoggedIn={(session) => setState({ screen: 'home', ...session })} />
      )}
      {state.screen === 'home' && <HomeScreen user={state.user} apiUrl={state.apiUrl} onLogout={() => signOut(state.token, state.apiUrl)} />}
      {state.screen === 'offline' && (
        <View style={styles.center}>
          <Text style={styles.message}>{state.message}</Text>
          <Pressable style={styles.retry} onPress={restore} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => signOut(state.token, state.apiUrl)} accessibilityRole="button">
            <Text style={styles.secondaryText}>Log out</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surface },
  message: { fontSize: 16, color: colors.ink, textAlign: 'center', marginBottom: 20 },
  retry: { height: 52, paddingHorizontal: 32, borderRadius: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 48, justifyContent: 'center', marginTop: 8, paddingHorizontal: 16 },
  secondaryText: { color: colors.blue, fontSize: 15, fontWeight: '600' },
});
