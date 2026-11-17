import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { leadChanges, leadFormErrors, MANUAL_SOURCES, type LeadFormValues } from '../lib/lead-form';
import { formatLitres, SUMP_SIZES_LITRES, type LeadDetail } from '../lib/workflow';
import { useSession } from '../session';
import { colors } from '../theme';
import { Button, Chip, ErrorBanner, FieldLabel, inputStyle, Sheet } from './ui';

/** The lead's fields, big and thumb-friendly: name, phone, city, product and size, email, notes (and source for a new lead). */
export function LeadFields({
  values,
  onChange,
  errors,
  withSource,
}: {
  values: LeadFormValues;
  onChange: (v: LeadFormValues) => void;
  errors: Partial<Record<keyof LeadFormValues, string>>;
  withSource?: boolean;
}) {
  const set = <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) => onChange({ ...values, [key]: value });
  const field = (key: 'name' | 'phone' | 'city' | 'email', label: string, props: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <>
      <FieldLabel>{label}</FieldLabel>
      <TextInput testID={`field-${key}`} style={[inputStyle, errors[key] && styles.bad]} value={values[key]} onChangeText={(t) => set(key, t)} placeholderTextColor={colors.ink3} {...props} />
      {errors[key] && <Text style={styles.error}>{errors[key]}</Text>}
    </>
  );
  return (
    <View>
      {field('name', 'Name *', { placeholder: 'Customer or company name', autoCapitalize: 'words', maxLength: 120 })}
      {field('phone', 'Phone *', { placeholder: '98765 43210', keyboardType: 'phone-pad', maxLength: 20 })}
      {field('city', 'City', { placeholder: 'e.g. Coimbatore', autoCapitalize: 'words', maxLength: 80 })}
      <FieldLabel>Product</FieldLabel>
      <View style={styles.row}>
        <Chip testID="product-SUMP" label="Sump" active={values.productInterest === 'SUMP'} onPress={() => set('productInterest', values.productInterest === 'SUMP' ? null : 'SUMP')} />
        <Chip testID="product-MICROBES" label="Microbes" active={values.productInterest === 'MICROBES'} onPress={() => set('productInterest', values.productInterest === 'MICROBES' ? null : 'MICROBES')} />
        <Chip testID="product-none" label="Not known yet" active={values.productInterest === null} onPress={() => set('productInterest', null)} />
      </View>
      {values.productInterest === 'SUMP' && (
        <>
          <FieldLabel>Sump size (optional)</FieldLabel>
          <View style={styles.row}>
            {SUMP_SIZES_LITRES.map((s) => (
              <Chip key={s} testID={`size-${s}`} label={formatLitres(s)} active={values.sumpSizeLitres === s} onPress={() => set('sumpSizeLitres', values.sumpSizeLitres === s ? null : s)} />
            ))}
          </View>
        </>
      )}
      {withSource && (
        <>
          <FieldLabel>Where did this lead come from?</FieldLabel>
          <View style={styles.row}>
            {MANUAL_SOURCES.map((s) => (
              <Chip key={s.key} testID={`source-${s.key}`} label={s.label} active={values.source === s.key} onPress={() => set('source', s.key)} />
            ))}
          </View>
        </>
      )}
      {field('email', 'Email (optional)', { placeholder: 'name@example.com', keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false })}
      <FieldLabel>Notes (optional)</FieldLabel>
      <TextInput testID="field-notes" style={[inputStyle, styles.notes]} value={values.notes} onChangeText={(t) => set('notes', t)} placeholder="Anything the team should know" placeholderTextColor={colors.ink3} multiline maxLength={2000} />
    </View>
  );
}

export const leadToForm = (l: Pick<LeadDetail, 'name' | 'phone' | 'email' | 'city' | 'source' | 'productInterest' | 'sumpSizeLitres' | 'notes'>): LeadFormValues => ({
  name: l.name,
  phone: l.phone,
  email: l.email ?? '',
  city: l.city ?? '',
  source: l.source,
  productInterest: l.productInterest,
  sumpSizeLitres: l.sumpSizeLitres,
  notes: l.notes ?? '',
});

/** Edit a lead's details (PATCH /leads/:id, only what changed), as on the web lead page. */
export function EditLeadSheet({ lead, onClose, onDone }: { lead: LeadDetail; onClose: () => void; onDone: (result: { movedOutOfScope?: boolean }) => void }) {
  const { api } = useSession();
  const [before] = useState(() => leadToForm(lead));
  const [values, setValues] = useState(before);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = tried ? leadFormErrors(values) : {};
  const changes = leadChanges(before, values);
  const changed = Object.keys(changes).length > 0;

  async function save() {
    setTried(true);
    if (Object.keys(leadFormErrors(values)).length > 0 || !changed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ movedOutOfScope?: boolean }>(`/leads/${lead.id}`, { method: 'PATCH', body: changes });
      onDone(result ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the changes.');
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`Edit ${lead.name}`}
      onClose={onClose}
      footer={
        <>
          <ErrorBanner message={error} />
          <Button testID="save-lead" label={changed ? 'Save changes' : 'No changes yet'} onPress={save} disabled={!changed} busy={busy} style={styles.gap} />
        </>
      }
    >
      <LeadFields values={values} onChange={setValues} errors={errors} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bad: { borderColor: colors.red },
  error: { fontSize: 13, color: colors.red, marginTop: 4 },
  notes: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  gap: { marginTop: 10 },
});
