import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { reminderItems, remindersEmpty, type PipelineRow, type ReminderSummary } from '../lib/dashboard';
import { quoteOfTheDay } from '../lib/quotes';
import type { CheckIn } from '../lib/sales';
import { formatDateTime } from '../lib/workflow';
import { colors } from '../theme';
import { useUser } from '../session';
import { useResource } from '../use-resource';

const timeOnly = (at: string) => new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

/** "Thought for today": the same quote as the web dashboard, the same for everyone today. */
export function DailyQuoteCard() {
  const [quote] = useState(() => quoteOfTheDay());
  return (
    <View style={styles.quote} accessibilityRole="text">
      <View style={styles.quoteBar} />
      <View style={styles.quoteIcon}>
        <Ionicons name="chatbox-ellipses-outline" size={20} color={colors.blue} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.quoteLabel}>THOUGHT FOR TODAY</Text>
        <Text style={styles.quoteText}>{quote.text}</Text>
        {quote.author && <Text style={styles.quoteAuthor}>— {quote.author}</Text>}
      </View>
    </View>
  );
}

/** Shortcuts under the hero: my follow-ups, the calendar, and adding a lead (when the account may). */
export function ShortcutRow() {
  const router = useRouter();
  const { can } = useUser();
  const sales = can('leads.receive_qualified');
  const canAdd = can('leads.write') || can('leads.quick_add');
  const items: { key: string; label: string; icon: 'alarm-outline' | 'calendar-outline' | 'person-add-outline'; href: '/follow-ups' | '/calendar' | '/new-lead' }[] = [
    { key: 'follow-ups', label: sales ? 'Follow-ups' : 'Callbacks', icon: 'alarm-outline', href: '/follow-ups' },
    { key: 'calendar', label: 'Calendar', icon: 'calendar-outline', href: '/calendar' },
    ...(canAdd ? [{ key: 'new-lead', label: 'New lead', icon: 'person-add-outline' as const, href: '/new-lead' as const }] : []),
  ];
  return (
    <View style={styles.shortcuts}>
      {items.map((i) => (
        <Pressable key={i.key} testID={`go-${i.key}`} onPress={() => router.push(i.href)} style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]} accessibilityRole="button">
          <Ionicons name={i.icon} size={22} color={colors.blue} />
          <Text style={styles.shortcutText}>{i.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** "My reminders today", as on web: overdue and due-today follow-ups (tap one to open it) and what's new for you. */
export function RemindersCard() {
  const router = useRouter();
  const { data } = useResource<ReminderSummary>('/notifications/summary');
  if (!data) return null;
  const items = reminderItems(data);
  const empty = remindersEmpty(data);
  return (
    <View style={styles.card} testID="reminders">
      <View style={styles.cardHead}>
        <Ionicons name="notifications-outline" size={18} color={colors.blue} />
        <Text style={styles.cardTitle}>My reminders today</Text>
      </View>
      {empty ? (
        <Text style={styles.muted}>Nothing due. You&apos;re all caught up.</Text>
      ) : (
        <Text style={styles.summaryLine}>
          <Text style={data.overdue.length ? styles.red : styles.muted}>{data.overdue.length} overdue</Text>
          {'   '}
          <Text style={data.dueToday.length ? styles.amber : styles.muted}>{data.dueToday.length} due later today</Text>
          {data.assignedToday > 0 && <Text style={styles.ink}>{`   ${data.assignedToday} new leads for you`}</Text>}
          {data.handedToday > 0 && <Text style={styles.green}>{`   ${data.handedToday} handed to you`}</Text>}
        </Text>
      )}
      {items.length > 0 && (
        <View style={styles.chips}>
          {items.slice(0, 8).map((f) => (
            <Pressable
              key={f.id}
              onPress={() => router.push(`/lead/${f.lead.id}`)}
              style={[styles.chip, f.late ? styles.chipLate : styles.chipToday]}
              accessibilityRole="button"
              accessibilityLabel={`${f.lead.name}, ${f.late ? 'overdue' : `due ${timeOnly(f.scheduledAt)}`}`}
            >
              <Text style={[styles.chipName, { color: f.late ? colors.red : colors.amber }]} numberOfLines={1}>
                {f.lead.name}
              </Text>
              <Text style={[styles.chipWhen, { color: f.late ? colors.red : colors.amber }]}>{f.late ? 'overdue' : timeOnly(f.scheduledAt)}</Text>
            </Pressable>
          ))}
          {items.length > 8 && <Text style={styles.more}>+{items.length - 8} more</Text>}
        </View>
      )}
    </View>
  );
}

/**
 * My leads per pipeline stage, as bars. Tapping a stage opens the full lead
 * list filtered to it. `extra` rows (e.g. Won / Lost this month) show below.
 */
export function PipelineCard({
  title,
  subtitle,
  rows,
  extra = [],
}: {
  title: string;
  subtitle?: string;
  rows: PipelineRow[];
  extra?: { key: string; label: string; count: number; tone: 'good' | 'muted'; status: 'WON' | 'LOST' }[];
}) {
  const router = useRouter();
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <View style={styles.card} testID="pipeline">
      <View style={styles.cardHead}>
        <Ionicons name="git-commit-outline" size={18} color={colors.blue} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {subtitle && <Text style={styles.muted}>{subtitle}</Text>}
      {rows.length === 0 && <Text style={styles.muted}>No stages yet.</Text>}
      {rows.map((r) => (
        <Pressable
          key={r.id}
          testID={`stage-row-${r.name}`}
          onPress={() => router.push({ pathname: '/leads', params: { stageId: r.id, title: r.name } })}
          style={({ pressed }) => [styles.stageRow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${r.name}: ${r.count} lead${r.count === 1 ? '' : 's'}`}
        >
          <View style={styles.stageText}>
            <Text style={styles.stageName} numberOfLines={1}>
              {r.name}
              {!r.isActive ? ' (off)' : ''}
            </Text>
            <Text style={styles.stageCount}>{r.count}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${(r.count / max) * 100}%` }]} />
          </View>
        </Pressable>
      ))}
      {extra.length > 0 && (
        <View style={styles.extraRow}>
          {extra.map((x) => (
            <Pressable
              key={x.key}
              onPress={() => router.push({ pathname: '/leads', params: { status: x.status, title: x.label } })}
              style={({ pressed }) => [styles.extra, x.tone === 'good' && styles.extraGood, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={[styles.extraCount, x.tone === 'good' && { color: colors.green }]}>{x.count}</Text>
              <Text style={styles.extraLabel}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Site visits as pins on a free OpenStreetMap map (Leaflet in a WebView), as on
 * the web dashboard. No Google Maps, no API key. Tapping a pin's "Open lead"
 * opens that lead in the app.
 */
export function VisitsMap({ visits, height = 260 }: { visits: CheckIn[]; height?: number }) {
  const router = useRouter();
  const html = useMemo(() => {
    const pins = visits.map((v) => ({
      lat: v.latitude,
      lng: v.longitude,
      leadId: v.lead?.id ?? null,
      title: esc(v.lead?.name ?? v.customerName),
      sub: esc(`${formatDateTime(v.checkedInAt)}${v.accuracyMeters !== null ? ` · ±${v.accuracyMeters} m` : ''}`),
    }));
    // JSON inside <script>: escape "<" so a name can't close the tag.
    const data = JSON.stringify(pins).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{height:100%;margin:0;font-family:sans-serif}.o{display:inline-block;margin-top:6px;font-weight:700;color:#2557eb;text-decoration:none}</style></head>
<body><div id="m"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
var pins=${data};var map=L.map('m');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
var pts=[];pins.forEach(function(p){var m=L.circleMarker([p.lat,p.lng],{radius:9,color:'#fff',weight:2,fillColor:'#2557eb',fillOpacity:.95}).addTo(map);
m.bindPopup('<b>'+p.title+'</b><br>'+p.sub+(p.leadId?'<br><a class="o" href="#" onclick="window.ReactNativeWebView.postMessage(\\''+p.leadId+'\\');return false">Open lead →</a>':''));pts.push([p.lat,p.lng]);});
if(pts.length===1){map.setView(pts[0],15)}else if(pts.length){map.fitBounds(pts,{padding:[30,30],maxZoom:15})}else{map.setView([11.0168,76.9558],7)}
</script></body></html>`;
  }, [visits]);

  if (visits.length === 0) return null;
  return (
    <View style={[styles.map, { height }]} testID="visits-map">
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://crm.preconsump.com' }}
        onMessage={(e) => router.push(`/lead/${e.nativeEvent.data}`)}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        style={styles.flex}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  quote: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, paddingLeft: 18, marginHorizontal: 12, marginTop: 12, overflow: 'hidden' },
  quoteBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.aqua },
  quoteIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  quoteLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: colors.aqua },
  quoteText: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 3, lineHeight: 22 },
  quoteAuthor: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, marginHorizontal: 12, marginTop: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  muted: { fontSize: 14, color: colors.ink3 },
  summaryLine: { fontSize: 14, lineHeight: 20 },
  red: { color: colors.red, fontWeight: '700' },
  amber: { color: colors.amber, fontWeight: '700' },
  green: { color: colors.green, fontWeight: '600' },
  ink: { color: colors.ink2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1 },
  chipLate: { backgroundColor: colors.redLight, borderColor: colors.redLine },
  chipToday: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  chipName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  chipWhen: { fontSize: 12 },
  more: { alignSelf: 'center', fontSize: 13, color: colors.ink3 },
  stageRow: { minHeight: 52, justifyContent: 'center', paddingVertical: 6 },
  stageText: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  stageName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  stageCount: { fontSize: 18, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.tint, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.blue, minWidth: 4 },
  extraRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  extra: { flex: 1, minHeight: 64, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  extraGood: { borderColor: colors.greenLine, backgroundColor: colors.greenLight },
  extraCount: { fontSize: 22, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  extraLabel: { fontSize: 12, color: colors.ink3, marginTop: 1 },
  shortcuts: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 12 },
  shortcut: { flex: 1, minHeight: 64, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 4 },
  shortcutText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  map: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
});
