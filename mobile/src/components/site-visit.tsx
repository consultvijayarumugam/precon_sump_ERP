import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';
import { osmLink, type CheckIn } from '../lib/sales';
import { formatDateTime, type LeadStatus } from '../lib/workflow';
import { LocationProblem, readLocationOnce } from '../location';
import { useSession } from '../session';
import { colors } from '../theme';
import { Button, ErrorBanner, FieldLabel, inputStyle, Sheet } from './ui';
import { leadLabel } from '../lib/phone';

interface VisitableLead {
  id: string;
  name: string | null;
  phone: string;
  city: string | null;
  status: LeadStatus;
  stage: { name: string } | null;
}

/**
 * "I'm at site": pick one of your own leads (or it's fixed, on the lead's
 * page), take one GPS reading now, and record it with the time on that lead.
 * The same as the web check-in; the server checks the lead is yours.
 */
export function SiteVisitSheet({ lead, onClose, onDone }: { lead?: { id: string; name: string | null; phone: string }; onClose: () => void; onDone: () => void }) {
  const { api } = useSession();
  const [leads, setLeads] = useState<VisitableLead[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(lead?.id ?? null);
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'idle' | 'locating' | 'saving'>('idle');
  const [error, setError] = useState<{ message: string; settings: boolean } | null>(null);

  useEffect(() => {
    if (lead) return;
    api<VisitableLead[]>('/check-ins/leads').then(setLeads, (err) => setError({ message: err instanceof Error ? err.message : 'Could not load your leads.', settings: false }));
  }, [api, lead]);

  async function checkIn() {
    if (!chosen) return;
    setError(null);
    try {
      setStep('locating');
      const at = await readLocationOnce();
      setStep('saving');
      const visit = await api<CheckIn>('/check-ins', { method: 'POST', body: { leadId: chosen, ...at, note: note.trim() || undefined } });
      ToastAndroid.show(`Visit recorded at ${visit.lead ? leadLabel(visit.lead) : 'the site'}${at.accuracyMeters ? ` (±${at.accuracyMeters} m)` : ''}`, ToastAndroid.LONG);
      onDone();
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Could not record the visit.', settings: err instanceof LocationProblem && err.settings });
      setStep('idle');
    }
  }

  return (
    <Sheet
      title={lead ? `I'm at site: ${leadLabel(lead)}` : "I'm at site"}
      onClose={onClose}
      footer={
        <>
          <FieldLabel>Note (optional)</FieldLabel>
          <TextInput testID="visit-note" style={inputStyle} value={note} onChangeText={setNote} placeholder="e.g. Measured the pit, 5,000 L fits" placeholderTextColor={colors.ink3} maxLength={500} />
          <Text style={styles.small}>Takes one location reading now, with the time, and records it on the lead. Nothing is tracked afterwards.</Text>
          {error && <ErrorBanner message={error.message} />}
          {error?.settings && <Button label="Open Settings" tone="secondary" icon="settings-outline" onPress={() => void Linking.openSettings()} style={styles.gap} />}
          <Button
            testID="check-in"
            label={step === 'locating' ? 'Getting your location…' : step === 'saving' ? 'Saving…' : "I'm at site"}
            icon="navigate"
            onPress={checkIn}
            disabled={!chosen || step !== 'idle'}
            style={styles.gap}
          />
        </>
      }
    >
      {!lead && (
        <>
          <FieldLabel>Which lead are you visiting?</FieldLabel>
          {leads?.length === 0 && <Text style={styles.none}>No leads are assigned to you yet.</Text>}
          {!leads && !error && <Text style={styles.none}>Loading your leads…</Text>}
          {leads?.map((l) => (
            <Pressable
              key={l.id}
              testID={`visit-lead-${leadLabel(l)}`}
              onPress={() => setChosen(l.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen === l.id }}
              style={[styles.leadRow, chosen === l.id && styles.leadRowOn]}
            >
              <Ionicons name={chosen === l.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={chosen === l.id ? colors.blue : colors.ink3} />
              <View style={styles.flex}>
                <Text style={styles.leadName}>{leadLabel(l)}</Text>
                <Text style={styles.leadMeta}>{[l.city, l.stage?.name].filter(Boolean).join(' · ')}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </Sheet>
  );
}

/** One recorded visit: lead, time, note, and a tap to see it on OpenStreetMap. */
export function VisitRow({ visit, onOpenLead, showPerson }: { visit: CheckIn; onOpenLead?: () => void; showPerson?: boolean }) {
  return (
    <View style={styles.visit}>
      <Ionicons name="location" size={22} color={colors.blue} style={styles.pin} />
      <View style={styles.flex}>
        <Pressable onPress={onOpenLead} disabled={!onOpenLead} accessibilityRole={onOpenLead ? 'button' : undefined}>
          <Text style={styles.leadName}>{visit.lead ? leadLabel(visit.lead) : visit.customerName}</Text>
        </Pressable>
        <Text style={styles.leadMeta}>
          {formatDateTime(visit.checkedInAt)}
          {visit.accuracyMeters !== null ? ` · ±${visit.accuracyMeters} m` : ''}
          {showPerson ? ` · ${visit.person.fullName}` : ''}
        </Text>
        {visit.notes ? <Text style={styles.note}>{visit.notes}</Text> : null}
      </View>
      <Pressable
        onPress={() => void Linking.openURL(osmLink(visit.latitude, visit.longitude))}
        style={styles.mapButton}
        accessibilityRole="link"
        accessibilityLabel={`Map of the visit to ${visit.lead ? leadLabel(visit.lead) : visit.customerName}`}
      >
        <Ionicons name="map-outline" size={18} color={colors.blue} />
        <Text style={styles.mapText}>Map</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  none: { fontSize: 14, color: colors.ink3, paddingVertical: 8 },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, marginBottom: 8 },
  leadRowOn: { borderColor: colors.blue, backgroundColor: colors.tint },
  leadName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  leadMeta: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  small: { fontSize: 13, color: colors.ink3, marginTop: 10 },
  gap: { marginTop: 12 },
  visit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pin: { marginTop: 1 },
  note: { fontSize: 14, color: colors.ink2, marginTop: 3 },
  mapButton: { minHeight: 44, minWidth: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 10 },
  mapText: { fontSize: 14, fontWeight: '700', color: colors.blue },
});
