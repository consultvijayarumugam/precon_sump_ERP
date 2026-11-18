import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { customRange, LIST_PRESETS, PRESET_LABELS, presetRange, rangeLabel, type DateRange, type PresetKey } from '../lib/date-range';
import { colors } from '../theme';
import { Chip } from './ui';

/**
 * Date filter, as on the web: one-tap presets (Today, This week, This month,
 * Last month, All time) and Custom, which asks for the first and the last day
 * with the phone's date dialogs. `caption` says what the dates apply to.
 */
export function DateRangeBar({
  value,
  onChange,
  presets = LIST_PRESETS,
  caption,
  testID = 'dates',
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  presets?: PresetKey[];
  caption?: string;
  testID?: string;
}) {
  function pickCustom() {
    const start = value.from ? new Date(`${value.from}T12:00:00`) : new Date();
    ToastAndroid.show('Pick the first day', ToastAndroid.SHORT);
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      onValueChange: (_e, first) => {
        ToastAndroid.show('Now pick the last day', ToastAndroid.SHORT);
        DateTimePickerAndroid.open({
          value: value.to ? new Date(`${value.to}T12:00:00`) : first,
          mode: 'date',
          onValueChange: (_e2, last) => onChange(customRange(first, last)),
        });
      },
    });
  }

  return (
    <View testID={testID}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
        {presets.map((p) => (
          <Chip key={p} testID={`${testID}-${p}`} label={PRESET_LABELS[p]} active={value.preset === p} onPress={() => onChange(presetRange(p))} />
        ))}
        <Chip testID={`${testID}-custom`} label={value.preset === 'custom' ? rangeLabel(value) : 'Custom…'} active={value.preset === 'custom'} onPress={pickCustom} />
      </ScrollView>
      {caption && value.preset !== 'all' && (
        <View style={styles.captionRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.ink3} />
          <Text style={styles.caption}>{caption}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 6 },
  caption: { fontSize: 13, color: colors.ink3 },
});
