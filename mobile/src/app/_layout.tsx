import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../session';
import { colors } from '../theme';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { state } = useSession();
  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hide();
  }, [state.status]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy900 },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Protected guard={state.status === 'in'}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="lead/[id]" options={{ title: 'Lead' }} />
      </Stack.Protected>
      <Stack.Protected guard={state.status === 'out' || state.status === 'loading'}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={state.status === 'offline'}>
        <Stack.Screen name="offline" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
