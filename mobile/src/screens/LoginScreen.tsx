import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, login, User } from '../api';
import { normalizeApiUrl } from '../lib/api-url';
import { saveApiUrl, saveToken } from '../storage';
import { colors } from '../theme';

export function LoginScreen({
  apiUrl,
  notice,
  onLoggedIn,
}: {
  apiUrl: string;
  notice: string | null;
  onLoggedIn: (session: { user: User; token: string; apiUrl: string }) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [server, setServer] = useState(apiUrl);
  const [editingServer, setEditingServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    const url = normalizeApiUrl(server);
    if (!url) {
      setEditingServer(true);
      setError("That server address doesn't look right. Example: http://192.168.31.50:4000");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await login(url, email.trim(), password);
      await saveApiUrl(url);
      await saveToken(result.accessToken);
      onLoggedIn({ user: result.user, token: result.accessToken, apiUrl: url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>
            Precon <Text style={styles.brandAccent}>Sump</Text>
          </Text>
          <Text style={styles.subtitle}>Sign in with your CRM account</Text>

          <View style={styles.card}>
            {notice && <Text style={styles.notice}>{notice}</Text>}
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="email"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              placeholder="you@precon.local"
              placeholderTextColor={colors.ink3}
              returnKeyType="next"
            />
            <Text style={styles.label}>Password</Text>
            <View>
              <TextInput
                testID="password"
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                placeholder="Password"
                placeholderTextColor={colors.ink3}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Pressable style={styles.showButton} onPress={() => setShowPassword((v) => !v)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>

            {error && (
              <Text testID="error" style={styles.error} accessibilityLiveRegion="polite">
                {error}
              </Text>
            )}

            <Pressable
              testID="login"
              style={({ pressed }) => [styles.button, !canSubmit && styles.buttonOff, pressed && styles.buttonPressed]}
              onPress={submit}
              disabled={!canSubmit}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log in</Text>}
            </Pressable>
          </View>

          <View style={styles.server}>
            {editingServer ? (
              <>
                <Text style={styles.label}>Server address</Text>
                <TextInput
                  testID="server"
                  style={styles.input}
                  value={server}
                  onChangeText={setServer}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="http://192.168.31.50:4000"
                  placeholderTextColor={colors.ink3}
                />
                <Text style={styles.hint}>Saved when you log in. Emulator: http://10.0.2.2:4000</Text>
              </>
            ) : (
              <Pressable onPress={() => setEditingServer(true)} accessibilityRole="button" style={styles.serverRow}>
                <Text style={styles.hint} numberOfLines={1}>
                  Server: {server}
                </Text>
                <Text style={styles.link}>Change</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  brand: { fontSize: 32, fontWeight: '700', color: colors.navy, textAlign: 'center' },
  brandAccent: { color: colors.blue },
  subtitle: { marginTop: 4, marginBottom: 24, fontSize: 15, color: colors.ink2, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 20 },
  notice: { backgroundColor: colors.blueLight, color: colors.navy, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 14 },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink2, marginBottom: 6, marginTop: 8 },
  input: { height: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: colors.card },
  passwordInput: { paddingRight: 64 },
  showButton: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  link: { color: colors.blue, fontWeight: '600', fontSize: 14 },
  error: { backgroundColor: colors.redLight, color: colors.red, borderRadius: 8, padding: 12, marginTop: 14, fontSize: 14 },
  button: { height: 52, borderRadius: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonOff: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  server: { marginTop: 16, paddingHorizontal: 4 },
  serverRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44 },
  hint: { flexShrink: 1, fontSize: 13, color: colors.ink3, marginTop: 4 },
});
