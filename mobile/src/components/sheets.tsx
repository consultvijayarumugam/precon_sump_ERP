import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSession } from '../session';
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES, CallOutcome, callbackPresets, CLOSING_OUTCOMES, defaultCallbackFor, formatLitres, LibraryFile, MessageTemplate, ProductInterest, SalesTeam, SUMP_SIZES_LITRES } from '../lib/workflow';
import { colors, space } from '../theme';
import { CallbackPicker } from './callback-picker';
import { Button, Chip, ErrorBanner, FieldLabel, inputStyle, Sheet } from './ui';

const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** GETs once when a sheet opens. */
function useOnce<T>(path: string) {
  const { api } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<T>(path).then(setData, (err) => setError(messageOf(err, 'Could not load this.')));
  }, [api, path]);
  return { data, error };
}

export function LogCallSheet({
  leadId,
  leadName,
  onClose,
  onDone,
}: {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onDone: (result: { interested: boolean }) => void;
}) {
  const { api } = useSession();
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState('');
  const [callback, setCallback] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closes = outcome !== null && CLOSING_OUTCOMES.includes(outcome);

  async function save() {
    if (!outcome) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/leads/${leadId}/calls`, {
        method: 'POST',
        body: { outcome, note: note.trim() || undefined, nextCallbackAt: !closes && callback ? callback.toISOString() : undefined },
      });
      onDone({ interested: outcome === 'INTERESTED' });
    } catch (err) {
      setError(messageOf(err, 'Could not save the call.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={`How did the call go? ${leadName}`} onClose={onClose}>
      <View style={styles.grid}>
        {CALL_OUTCOMES.map((o) => (
          <Pressable
            key={o}
            testID={`outcome-${o}`}
            onPress={() => {
              setOutcome(o);
              setCallback(defaultCallbackFor(o));
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: outcome === o }}
            style={[styles.outcome, outcome === o && { backgroundColor: CLOSING_OUTCOMES.includes(o) ? colors.red : o === 'INTERESTED' ? colors.green : colors.blue, borderColor: 'transparent' }]}
          >
            <Text style={[styles.outcomeText, outcome === o && styles.outcomeTextOn]}>{CALL_OUTCOME_LABELS[o]}</Text>
          </Pressable>
        ))}
      </View>
      {outcome && (
        <>
          {closes ? (
            <Text style={styles.warning}>This closes the lead as Lost; it leaves your list.</Text>
          ) : (
            <>
              <FieldLabel>{outcome === 'INTERESTED' ? 'Next callback (optional; you can qualify next)' : 'Next callback'}</FieldLabel>
              <CallbackPicker value={callback} onChange={setCallback} allowNone />
            </>
          )}
          <FieldLabel>Note (optional)</FieldLabel>
          <TextInput testID="note" style={inputStyle} value={note} onChangeText={setNote} placeholder="What did they say?" placeholderTextColor={colors.ink3} maxLength={1000} />
        </>
      )}
      <ErrorBanner message={error} />
      <Button testID="save-call" label="Save call" style={styles.save} onPress={save} disabled={!outcome} busy={busy} />
    </Sheet>
  );
}

export function CallbackSheet({ leadId, leadName, current, onClose, onDone }: { leadId: string; leadName: string; current: string | null; onClose: () => void; onDone: () => void }) {
  const { api } = useSession();
  const [value, setValue] = useState<Date | null>(() => (current && new Date(current) > new Date() ? new Date(current) : callbackPresets()[0].at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/leads/${leadId}/next-callback`, { method: 'PUT', body: { scheduledAt: value.toISOString() } });
      onDone();
    } catch (err) {
      setError(messageOf(err, 'Could not set the callback.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={`${current ? 'Move the next callback' : 'Set the next callback'}: ${leadName}`} onClose={onClose}>
      <CallbackPicker value={value} onChange={setValue} />
      <ErrorBanner message={error} />
      <Button testID="save-callback" label="Save callback" style={styles.save} onPress={save} disabled={!value} busy={busy} />
    </Sheet>
  );
}

export function QualifySheet({
  lead,
  onClose,
  onDone,
}: {
  lead: { id: string; name: string; productInterest: ProductInterest | null; sumpSizeLitres: number | null; city: string | null };
  onClose: () => void;
  onDone: (handedTo: string) => void;
}) {
  const { api } = useSession();
  const team = useOnce<SalesTeam>('/sales-team');
  const [product, setProduct] = useState<ProductInterest | null>(lead.productInterest);
  const [size, setSize] = useState<number | null>(lead.sumpSizeLitres);
  const [city, setCity] = useState(lead.city ?? '');
  const [notes, setNotes] = useState('');
  const [salesUserId, setSalesUserId] = useState<string | null>(null); // null = round-robin
  const [followUp, setFollowUp] = useState<Date | null>(() => callbackPresets().find((p) => p.label.startsWith('Tomorrow'))?.at ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ handedTo: { fullName: string } }>(`/leads/${lead.id}/qualify`, {
        method: 'POST',
        body: {
          productInterest: product,
          sumpSizeLitres: product === 'SUMP' && size ? size : undefined,
          city: city.trim() || undefined,
          notes: notes.trim() || undefined,
          salesUserId: salesUserId ?? undefined,
          salesFollowUpAt: followUp ? followUp.toISOString() : undefined,
        },
      });
      onDone(result.handedTo.fullName);
    } catch (err) {
      setError(messageOf(err, 'Could not qualify the lead.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Qualify and hand to sales: ${lead.name}`} onClose={onClose}>
      <FieldLabel>Product *</FieldLabel>
      <View style={styles.chips}>
        <Chip testID="product-SUMP" label="Sump" active={product === 'SUMP'} onPress={() => setProduct('SUMP')} />
        <Chip testID="product-MICROBES" label="Microbes" active={product === 'MICROBES'} onPress={() => setProduct('MICROBES')} />
      </View>
      {product === 'SUMP' && (
        <>
          <FieldLabel>Sump size</FieldLabel>
          <View style={styles.chips}>
            <Chip label="Not decided" active={size === null} onPress={() => setSize(null)} />
            {SUMP_SIZES_LITRES.map((s) => (
              <Chip key={s} testID={`size-${s}`} label={formatLitres(s)} active={size === s} onPress={() => setSize(s)} />
            ))}
          </View>
        </>
      )}
      <FieldLabel>City</FieldLabel>
      <TextInput testID="city" style={inputStyle} value={city} onChangeText={setCity} placeholder="e.g. Erode" placeholderTextColor={colors.ink3} maxLength={80} />
      <FieldLabel>Hand to</FieldLabel>
      <View style={styles.chips}>
        <Chip testID="hand-next" label={team.data?.nextUp ? `Next in turn: ${team.data.nextUp.fullName}` : 'Next in turn'} active={salesUserId === null} onPress={() => setSalesUserId(null)} />
        {team.data?.members.map((m) => (
          <Chip key={m.id} label={m.inRotation ? m.fullName : `${m.fullName} (not taking new leads)`} active={salesUserId === m.id} onPress={() => setSalesUserId(m.id)} />
        ))}
      </View>
      <FieldLabel>Notes for the salesperson</FieldLabel>
      <TextInput
        testID="handover-notes"
        style={[inputStyle, styles.multiline]}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Need, timeline, budget, best time to call"
        placeholderTextColor={colors.ink3}
        maxLength={2000}
      />
      <FieldLabel>When should sales call?</FieldLabel>
      <CallbackPicker value={followUp} onChange={setFollowUp} allowNone />
      <ErrorBanner message={error ?? team.error} />
      <Button testID="save-qualify" label="Qualify & hand over" style={styles.save} onPress={save} disabled={!product} busy={busy} />
    </Sheet>
  );
}

/** Pick a template (and any library files); the server fills it in and logs it, then WhatsApp opens. */
export function WhatsAppSheet({ leadId, leadName, onClose, onDone }: { leadId: string; leadName: string; onClose: () => void; onDone: () => void }) {
  const { api } = useSession();
  const templates = useOnce<MessageTemplate[]>('/message-templates');
  const files = useOnce<LibraryFile[]>('/files');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = useCallback((id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 5 ? p : [...p, id])), []);

  async function send(templateId: string | null) {
    setBusy(templateId ?? 'blank');
    setError(null);
    try {
      const { url } = await api<{ url: string }>(`/leads/${leadId}/whatsapp`, {
        method: 'POST',
        body: { ...(templateId ? { templateId } : {}), ...(picked.length ? { fileIds: picked } : {}) },
      });
      await Linking.openURL(url);
      onDone();
    } catch (err) {
      setError(messageOf(err, 'Could not open WhatsApp.'));
      setBusy(null);
    }
  }

  return (
    <Sheet title={`WhatsApp ${leadName}`} onClose={onClose}>
      {files.data && files.data.length > 0 && (
        <>
          <FieldLabel>Add files (sent as links)</FieldLabel>
          {files.data.map((f) => {
            const on = picked.includes(f.id);
            return (
              <Pressable key={f.id} style={styles.fileRow} onPress={() => toggle(f.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.blue : colors.ink3} />
                <Ionicons name={f.kind === 'pdf' ? 'document-text-outline' : 'image-outline'} size={20} color={f.kind === 'pdf' ? colors.red : colors.blue} />
                <View style={styles.fileText}>
                  <Text style={styles.fileTitle} numberOfLines={1}>
                    {f.title}
                  </Text>
                  <Text style={styles.fileMeta}>{f.categoryLabel}</Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}
      <FieldLabel>Pick a message</FieldLabel>
      {!templates.data && !templates.error && <ActivityIndicator color={colors.blue} />}
      {templates.data?.map((t) => (
        <Pressable key={t.id} testID={`template-${t.name}`} style={styles.template} disabled={busy !== null} onPress={() => send(t.id)} accessibilityRole="button">
          <Text style={styles.templateName}>{busy === t.id ? 'Opening WhatsApp…' : t.name}</Text>
          <Text style={styles.templateBody} numberOfLines={2}>
            {t.body}
          </Text>
        </Pressable>
      ))}
      <ErrorBanner message={error ?? templates.error ?? files.error} />
      <Button tone="secondary" label={busy === 'blank' ? 'Opening WhatsApp…' : picked.length ? 'Send just the file links' : 'Open chat without a message'} style={styles.save} onPress={() => send(null)} disabled={busy !== null} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  outcome: { width: '48.5%', minHeight: space.tapLarge, borderRadius: space.radius, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  outcomeText: { fontSize: 15, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  outcomeTextOn: { color: '#FFFFFF' },
  warning: { marginTop: 14, color: colors.red, fontSize: 14, fontWeight: '600' },
  save: { marginTop: 16, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  multiline: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: space.tap, paddingVertical: 6 },
  fileText: { flex: 1 },
  fileTitle: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  fileMeta: { fontSize: 12, color: colors.ink3 },
  template: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: space.radius, padding: 12, marginBottom: 8 },
  templateName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  templateBody: { marginTop: 2, fontSize: 13, color: colors.ink2 },
});
