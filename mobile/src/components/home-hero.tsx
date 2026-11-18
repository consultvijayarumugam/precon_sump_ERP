import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotificationBell } from '../screens/NotificationsScreen';
import { useUser } from '../session';
import { colors, space } from '../theme';

export function Tile({ value, label, alert, testID }: { value: number | undefined; label: string; alert?: boolean; testID?: string }) {
  return (
    <View testID={testID} style={[styles.tile, alert && styles.tileAlert]}>
      <Text style={styles.tileValue}>{value ?? '–'}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/** The blue top of each Home tab: greeting, bell, profile (opens More), the day's numbers and any big buttons. */
export function HomeHero({ subtitle, tiles, hints, children }: { subtitle: string; tiles: ReactNode; hints?: string | null; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  return (
    <LinearGradient colors={[colors.navy950, colors.ocean]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 12 }]}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.greeting}>Hi {user.fullName.split(/\s+/)[0]}</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>
        <NotificationBell />
        <Pressable testID="account" onPress={() => router.navigate('/more')} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Profile and settings">
          <Ionicons name="person-circle-outline" size={32} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.tiles}>{tiles}</View>
      {hints ? <Text style={styles.hints}>{hints}</Text> : null}
      {children}
    </LinearGradient>
  );
}

/** A titled block on a Home tab with a "See all" link to the tab that has the rest. */
export function SectionHead({ title, color = colors.ink2, action, onAction, testID }: { title: string; color?: string; action?: string; onAction?: () => void; testID?: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color }]}>{title}</Text>
      {action && onAction && (
        <Pressable testID={testID} onPress={onAction} style={styles.sectionAction} accessibilityRole="button">
          <Text style={styles.sectionActionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.blue} />
        </Pressable>
      )}
    </View>
  );
}

/** Big white (primary) or outlined button on the blue hero. */
export function HeroButton({ label, icon, onPress, primary, testID, hint }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; primary?: boolean; testID?: string; hint?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.heroButton, primary ? styles.heroPrimary : styles.heroOutline, pressed && styles.pressed]} accessibilityRole="button" accessibilityHint={hint}>
      <Ionicons name={icon} size={20} color={primary ? colors.navy950 : '#FFFFFF'} />
      <Text style={[styles.heroButtonText, primary && { color: colors.navy950 }]}>{label}</Text>
    </Pressable>
  );
}

export const heroStyles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: 8, marginTop: 12 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  hero: { paddingHorizontal: 16, paddingBottom: 16 },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  greeting: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  sub: { color: '#C9DDF5', fontSize: 14, marginTop: 2 },
  iconButton: { width: space.tap, height: space.tap, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: '#FFFFFF1F', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  tileAlert: { backgroundColor: '#DC2626' },
  tileValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tileLabel: { color: '#E6F0FC', fontSize: 12, marginTop: 1 },
  hints: { color: '#C9DDF5', fontSize: 13, marginTop: 10 },
  heroButton: { flex: 1, minHeight: space.tapLarge, borderRadius: space.radius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroPrimary: { backgroundColor: '#FFFFFF' },
  heroOutline: { borderWidth: 1.5, borderColor: '#FFFFFF66' },
  heroButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8, paddingTop: 18, paddingBottom: 6 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: space.tap, paddingHorizontal: 8 },
  sectionActionText: { fontSize: 14, fontWeight: '700', color: colors.blue },
});
