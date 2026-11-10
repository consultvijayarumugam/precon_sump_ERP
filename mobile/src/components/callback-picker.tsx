import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { callbackPresets, formatDateTime } from '../lib/workflow';
import { colors } from '../theme';
import { Chip } from './ui';

/** One-tap times, plus the phone's date and time dialogs for anything else. */
export function CallbackPicker({ value, onChange, allowNone }: { value: Date | null; onChange: (at: Date | null) => void; allowNone?: boolean }) {
  const [presets] = useState(() => callbackPresets());
  const isPreset = value !== null && presets.some((p) => p.at.getTime() === value.getTime());

  function pick() {
    const start = value ?? presets[0].at;
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      minimumDate: new Date(),
      onValueChange: (_event, day) => {
        DateTimePickerAndroid.open({
          value: start,
          mode: 'time',
          onValueChange: (_timeEvent, time) => {
            const at = new Date(day);
            at.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(at);
          },
        });
      },
    });
  }

  return (
    <View>
      <View style={styles.chips}>
        {allowNone && <Chip label="No callback" active={value === null} onPress={() => onChange(null)} />}
        {presets.map((p) => (
          <Chip key={p.label} label={p.label} active={value?.getTime() === p.at.getTime()} onPress={() => onChange(p.at)} />
        ))}
        <Chip testID="pick-date" label="Pick date & time" active={value !== null && !isPreset} onPress={pick} />
      </View>
      {value && <Text style={styles.chosen}>{formatDateTime(value)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chosen: { marginTop: 8, fontSize: 14, fontWeight: '600', color: colors.ocean },
});
