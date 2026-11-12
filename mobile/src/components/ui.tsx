import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LeadStatus, StageRef } from '../lib/workflow';
import { colors, space } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Tone = 'primary' | 'whatsapp' | 'secondary' | 'qualify';

const BUTTON: Record<Tone, { bg: string; border: string; fg: string }> = {
  primary: { bg: colors.blue, border: colors.blue, fg: '#FFFFFF' },
  whatsapp: { bg: colors.card, border: colors.greenLine, fg: colors.whatsapp },
  secondary: { bg: colors.card, border: colors.lineStrong, fg: colors.ink },
  qualify: { bg: colors.greenLight, border: colors.greenLine, fg: colors.green },
};

export function Button({
  label,
  icon,
  tone = 'primary',
  onPress,
  onLongPress,
  accessibilityHint,
  disabled,
  busy,
  testID,
  style,
}: {
  label: string;
  icon?: IconName;
  tone?: Tone;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const look = BUTTON[tone];
  const off = disabled || busy;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'More options' }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onLongPress?.()}
      android_ripple={{ color: '#00000018' }}
      style={[styles.button, { backgroundColor: look.bg, borderColor: look.border }, disabled && styles.off, style]}
    >
      {busy ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={20} color={look.fg} />}
          <Text style={[styles.buttonText, { color: look.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, tone, testID }: { label: string; active: boolean; onPress: () => void; tone?: 'danger' | 'good'; testID?: string }) {
  const on = tone === 'danger' ? colors.red : tone === 'good' ? colors.green : colors.blue;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && { backgroundColor: on, borderColor: on }]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const STAGE_TONE: Record<LeadStatus, { bg: string; fg: string }> = {
  NEW: { bg: '#E0F2FE', fg: '#0369A1' },
  CONTACTED: { bg: '#E0E7FF', fg: '#4338CA' },
  QUALIFIED: { bg: '#EDE9FE', fg: '#6D28D9' },
  QUOTED: { bg: '#FEF3C7', fg: '#B45309' },
  WON: { bg: '#D1FAE5', fg: '#047857' },
  LOST: { bg: '#E5E7EB', fg: '#4B5563' },
};

const STATUS_WORDS: Record<LeadStatus, string> = { NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', QUOTED: 'Quoted', WON: 'Won', LOST: 'Lost' };

export function StageBadge({ status, stage }: { status: LeadStatus; stage: StageRef | null }) {
  const tone = STAGE_TONE[stage?.phase ?? status];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{stage?.name ?? STATUS_WORDS[status]}</Text>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text testID="error" style={styles.error} accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

export function Centered({ children }: { children?: ReactNode }) {
  return <View style={styles.centered}>{children ?? <ActivityIndicator size="large" color={colors.blue} />}</View>;
}

export function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

/** A panel that slides up from the bottom, within thumb reach. Back and tapping outside close it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior="padding">
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle} numberOfLines={2}>
            {title}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const inputStyle = {
  minHeight: space.tap,
  borderWidth: 1,
  borderColor: colors.lineStrong,
  borderRadius: 10,
  paddingHorizontal: 14,
  fontSize: 16,
  color: colors.ink,
  backgroundColor: colors.card,
} as const;

const styles = StyleSheet.create({
  button: { minHeight: space.tapLarge, borderRadius: space.radius, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, overflow: 'hidden' },
  off: { opacity: 0.45 },
  buttonText: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  chipTextOn: { color: '#FFFFFF' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  error: { backgroundColor: colors.redLight, color: colors.red, borderRadius: 8, padding: 12, marginVertical: 8, fontSize: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink2, marginTop: 14, marginBottom: 8 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#071A3366' },
  sheet: { maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginBottom: 10 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 6 },
});
