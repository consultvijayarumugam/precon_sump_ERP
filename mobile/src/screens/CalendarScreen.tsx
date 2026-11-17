import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FollowUpSheet } from '../components/follow-up-sheet';
import { ErrorBanner } from '../components/ui';
import { byDay, calendarPath, dayKey, monthGrid, type FollowUpWithLead } from '../lib/followups';
import { useUser } from '../session';
import { colors, space } from '../theme';
import { useResource } from '../use-resource';
import { FollowUpRow } from './FollowUpsScreen';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthTitle = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const dayTitle = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

/** My follow-ups on a month calendar, as on the web Calendar page. Tap a day to see (and act on) its follow-ups. */
export function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { can } = useUser();
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(dayKey(today));
  const weeks = useMemo(() => monthGrid(month.y, month.m), [month]);
  const { data, error, refreshing, refresh, reload } = useResource<FollowUpWithLead[]>(calendarPath(weeks));
  const days = useMemo(() => byDay(data ?? []), [data]);
  const [open, setOpen] = useState<FollowUpWithLead | null>(null);
  const noun = can('leads.receive_qualified') ? 'follow-up' : 'callback';
  const todayKey = dayKey(today);

  const shift = (by: number) => {
    const next = new Date(month.y, month.m + by, 1);
    setMonth({ y: next.getFullYear(), m: next.getMonth() });
    setSelected(dayKey(next.getMonth() === today.getMonth() && next.getFullYear() === today.getFullYear() ? today : next));
  };
  const chosen = days.get(selected) ?? [];
  const [sy, sm, sd] = selected.split('-').map(Number);

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: 'Calendar' }} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.blue]} />} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
        <View style={styles.monthBar}>
          <Pressable testID="prev-month" onPress={() => shift(-1)} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={24} color={colors.blue} />
          </Pressable>
          <Text style={styles.monthTitle}>{monthTitle(month.y, month.m)}</Text>
          <Pressable testID="next-month" onPress={() => shift(1)} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={24} color={colors.blue} />
          </Pressable>
        </View>
        <ErrorBanner message={error} />
        <View style={styles.grid}>
          <View style={styles.week}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekday}>
                {w}
              </Text>
            ))}
          </View>
          {weeks.map((week) => (
            <View key={dayKey(week[0].date)} style={styles.week}>
              {week.map(({ date, inMonth }) => {
                const key = dayKey(date);
                const items = days.get(key) ?? [];
                const pending = items.filter((f) => !f.completedAt);
                const late = pending.some((f) => new Date(f.scheduledAt) < today);
                const isSelected = key === selected;
                return (
                  <Pressable
                    key={key}
                    testID={`day-${key}`}
                    onPress={() => setSelected(key)}
                    style={[styles.day, isSelected && styles.daySelected]}
                    accessibilityRole="button"
                    accessibilityLabel={`${date.getDate()} ${date.toLocaleDateString('en-IN', { month: 'long' })}, ${items.length} ${noun}${items.length === 1 ? '' : 's'}`}
                  >
                    <Text style={[styles.dayNumber, !inMonth && styles.otherMonth, key === todayKey && styles.today, isSelected && styles.dayNumberSelected]}>{date.getDate()}</Text>
                    {items.length > 0 && (
                      <View style={[styles.count, pending.length === 0 ? styles.countDone : late ? styles.countLate : styles.countDue]}>
                        <Text style={styles.countText}>{items.length}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        <Text style={styles.dayTitle}>
          {dayTitle(new Date(sy, sm - 1, sd))} · {chosen.length} {noun}
          {chosen.length === 1 ? '' : 's'}
        </Text>
        {chosen.length === 0 && <Text style={styles.empty}>Nothing planned this day.</Text>}
        {chosen.map((f) => (
          <FollowUpRow key={f.id} f={f} onPress={() => (f.completedAt || !can('followups.write') ? router.push(`/lead/${f.lead.id}`) : setOpen(f))} />
        ))}
      </ScrollView>
      {open && (
        <FollowUpSheet
          followUp={open}
          leadName={open.lead.name}
          noun={noun}
          onClose={() => setOpen(null)}
          onDone={(message) => {
            setOpen(null);
            ToastAndroid.show(message, ToastAndroid.SHORT);
            reload();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 8 },
  navButton: { width: space.tap, height: space.tap, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  grid: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginHorizontal: 12, marginTop: 4, padding: 6 },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.ink3, paddingVertical: 6 },
  day: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 6, borderRadius: 10 },
  daySelected: { backgroundColor: colors.tint },
  dayNumber: { fontSize: 15, fontWeight: '600', color: colors.ink },
  dayNumberSelected: { color: colors.blue, fontWeight: '800' },
  otherMonth: { color: colors.lineStrong },
  today: { color: colors.blue, textDecorationLine: 'underline' },
  count: { minWidth: 20, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginTop: 4 },
  countDue: { backgroundColor: colors.blue },
  countLate: { backgroundColor: colors.red },
  countDone: { backgroundColor: colors.green },
  countText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  dayTitle: { fontSize: 15, fontWeight: '700', color: colors.navy900, marginHorizontal: 16, marginTop: 16, marginBottom: 8 },
  empty: { fontSize: 14, color: colors.ink3, marginHorizontal: 16 },
});
