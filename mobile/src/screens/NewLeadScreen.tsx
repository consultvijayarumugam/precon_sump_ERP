import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LeadFields } from '../components/lead-form';
import { Button, Chip, ErrorBanner, FieldLabel, inputStyle } from '../components/ui';
import { emptyLead, leadFormErrors, newLeadBody } from '../lib/lead-form';
import { useSession, useUser } from '../session';
import { colors } from '../theme';

type Mode = 'quick' | 'full';

interface QuickAddResult {
  status: 'created' | 'duplicate';
  lead?: { id: string; name: string };
  assignedTo?: { fullName: string } | null;
  existing?: { id: string; name: string; status: string; assignedTo: { fullName: string } | null };
  previous?: { id: string; name: string; status: string } | null;
  addedToday: number;
}

/**
 * Add a lead from the phone, as on web: Quick add for a WhatsApp enquiry
 * (phone only; goes to the next telecaller in turn, duplicates of open leads
 * are caught), or the full form (assigned to you).
 */
export function NewLeadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const { can } = useUser();
  const canQuick = can('leads.quick_add');
  const canFull = can('leads.write');
  const [mode, setMode] = useState<Mode>(canQuick ? 'quick' : 'full');

  // Quick add
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<QuickAddResult | null>(null);

  // Full form
  const [values, setValues] = useState(emptyLead);
  const [tried, setTried] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quickAdd() {
    if (!phone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<QuickAddResult>('/leads/quick-add', { method: 'POST', body: { phone: phone.trim(), name: name.trim() || undefined, note: message.trim() || undefined } });
      setResult(r);
      if (r.status === 'created') {
        setPhone('');
        setName('');
        setMessage('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the lead.');
    } finally {
      setBusy(false);
    }
  }

  async function createLead() {
    setTried(true);
    if (Object.keys(leadFormErrors(values)).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const lead = await api<{ id: string; name: string }>('/leads', { method: 'POST', body: newLeadBody(values) });
      ToastAndroid.show(`${lead.name} added to your leads`, ToastAndroid.SHORT);
      router.replace(`/lead/${lead.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the lead.');
      setBusy(false);
    }
  }

  if (!canQuick && !canFull) {
    return (
      <View style={styles.page}>
        <Stack.Screen options={{ title: 'New lead' }} />
        <Text style={styles.empty}>Your account can&apos;t add leads. New leads reach you through the round-robin.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior="height">
      <Stack.Screen options={{ title: mode === 'quick' ? 'Quick add' : 'New lead' }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {canQuick && canFull && (
          <View style={styles.modes}>
            <Chip testID="mode-quick" label="Quick add (WhatsApp)" active={mode === 'quick'} onPress={() => setMode('quick')} />
            <Chip testID="mode-full" label="Full lead" active={mode === 'full'} onPress={() => setMode('full')} />
          </View>
        )}

        {mode === 'quick' ? (
          <>
            <Text style={styles.intro}>A WhatsApp enquiry: the phone number is all you need. It goes to the next telecaller in turn.</Text>
            <FieldLabel>Phone *</FieldLabel>
            <TextInput testID="qa-phone" style={inputStyle} value={phone} onChangeText={setPhone} placeholder="98765 43210 (with or without +91)" placeholderTextColor={colors.ink3} keyboardType="phone-pad" maxLength={30} autoFocus />
            <FieldLabel>Name (optional)</FieldLabel>
            <TextInput testID="qa-name" style={inputStyle} value={name} onChangeText={setName} placeholder="If they gave it" placeholderTextColor={colors.ink3} autoCapitalize="words" maxLength={120} />
            <FieldLabel>Their first message (optional)</FieldLabel>
            <TextInput testID="qa-message" style={[inputStyle, styles.multi]} value={message} onChangeText={setMessage} placeholder="Paste it here" placeholderTextColor={colors.ink3} multiline maxLength={2000} />

            {result?.status === 'created' && result.lead && (
              <View style={[styles.result, styles.resultGood]} accessibilityLiveRegion="polite">
                <Ionicons name="checkmark-circle" size={22} color={colors.green} />
                <View style={styles.flex}>
                  <Text style={styles.resultTitle}>
                    {result.lead.name} added{result.assignedTo ? ` for ${result.assignedTo.fullName}` : ''}
                  </Text>
                  {result.previous && <Text style={styles.resultBody}>Past customer: earlier lead {result.previous.name} ({result.previous.status.toLowerCase()}).</Text>}
                  <Text style={styles.resultBody}>You&apos;ve added {result.addedToday} today.</Text>
                </View>
              </View>
            )}
            {result?.status === 'duplicate' && result.existing && (
              <View style={[styles.result, styles.resultWarn]} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={22} color={colors.amber} />
                <View style={styles.flex}>
                  <Text style={styles.resultTitle}>Already an open lead: {result.existing.name}</Text>
                  <Text style={styles.resultBody}>
                    {result.existing.assignedTo ? `With ${result.existing.assignedTo.fullName}. ` : ''}Nothing new was added.
                  </Text>
                  <Button label="Open that lead" tone="secondary" onPress={() => router.push(`/lead/${result.existing!.id}`)} style={styles.gapSmall} />
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={styles.intro}>The lead is added to your leads.</Text>
            <LeadFields values={values} onChange={setValues} errors={tried ? leadFormErrors(values) : {}} withSource />
          </>
        )}
      </ScrollView>
      {/* Pinned, so the button is always within reach however long the form is. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <ErrorBanner message={error} />
        {mode === 'quick' ? (
          <Button testID="qa-add" label="Add lead" icon="flash" onPress={quickAdd} disabled={!phone.trim()} busy={busy} />
        ) : (
          <Button testID="create-lead" label="Add lead" icon="person-add" onPress={createLead} busy={busy} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  body: { padding: 16 },
  modes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  intro: { fontSize: 14, color: colors.ink2, marginTop: 4 },
  multi: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  gap: { marginTop: 16 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 10 },
  gapSmall: { marginTop: 10 },
  result: { flexDirection: 'row', gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 16 },
  resultGood: { backgroundColor: colors.greenLight, borderColor: colors.greenLine },
  resultWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  resultTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  resultBody: { fontSize: 14, color: colors.ink2, marginTop: 2 },
  empty: { fontSize: 15, color: colors.ink2, textAlign: 'center', margin: 24 },
});
