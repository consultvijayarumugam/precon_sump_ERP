import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { User } from '../api';
import { colors } from '../theme';

export function HomeScreen({ user, apiUrl, onLogout }: { user: User; apiUrl: string; onLogout: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.body}>
        <Text style={styles.brand}>
          Precon <Text style={styles.brandAccent}>Sump</Text>
        </Text>
        <View style={styles.card}>
          <Text testID="logged-in" style={styles.title}>
            Logged in as {user.fullName} ({user.role.name})
          </Text>
          <Text style={styles.detail}>{user.email}</Text>
          <Text style={styles.detail}>Server: {apiUrl}</Text>
        </View>
        <Pressable
          testID="logout"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            await onLogout();
          }}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={colors.blue} /> : <Text style={styles.buttonText}>Log out</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1, justifyContent: 'center', padding: 20 },
  brand: { fontSize: 32, fontWeight: '700', color: colors.navy900, textAlign: 'center', marginBottom: 24 },
  brandAccent: { color: colors.blue },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 20 },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink },
  detail: { marginTop: 6, fontSize: 14, color: colors.ink3 },
  button: { height: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.blue, fontSize: 16, fontWeight: '700' },
});
