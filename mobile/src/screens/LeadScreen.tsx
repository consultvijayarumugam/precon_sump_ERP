import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { ReactNode, useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Centered, ErrorBanner, StageBadge } from '../components/ui';
import { useLeadActions } from '../components/use-lead-actions';
import { formatDuration } from '../lib/call-sync';
import { CALL_OUTCOME_LABELS, CallAttemptRow, CallRow, canBeQualified, DeviceCallRow, DIRECTION_LABELS, formatDateTime, LeadDetail, MessageRow, productLabel, SOURCE_LABELS } from '../lib/workflow';
import { colors } from '../theme';
import { useResource } from '../use-resource';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{children}</Text>
    </View>
  );
}

function Activity({ tag, tagColor, title, body, meta, extra }: { tag: string; tagColor: string; title?: string; body?: string | null; meta: string; extra?: string }) {
  return (
    <View style={styles.activity}>
      <Text>
        <Text style={[styles.tag, { color: tagColor }]}>{tag.toUpperCase()} </Text>
        {title && <Text style={styles.activityTitle}>{title}</Text>}
      </Text>
      {body ? <Text style={styles.activityBody}>{body}</Text> : null}
      {extra ? <Text style={styles.shared}>{extra}</Text> : null}
      <Text style={styles.meta}>{meta}</Text>
    </View>
  );
}

function LeadBody({ lead, id, refreshing, onRefresh, reloadLead }: { lead: LeadDetail; id: string; refreshing: boolean; onRefresh: () => void; reloadLead: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const calls = useResource<CallRow[]>(`/leads/${id}/calls`);
  const attempts = useResource<CallAttemptRow[]>(`/leads/${id}/call-attempts`);
  const messages = useResource<MessageRow[]>(`/leads/${id}/messages`);
  const phoneCalls = useResource<DeviceCallRow[]>(`/leads/${id}/device-calls`);

  const reloadAll = useCallback(() => {
    reloadLead();
    calls.reload();
    attempts.reload();
    messages.reload();
    phoneCalls.reload();
  }, [reloadLead, calls.reload, attempts.reload, messages.reload, phoneCalls.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = useMemo(() => lead.followUps.filter((f) => !f.completedAt).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [lead.followUps]);
  const done = useMemo(() => lead.followUps.filter((f) => f.completedAt).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)), [lead.followUps]);
  const next = pending[0]?.scheduledAt ?? null;
  const actions = useLeadActions({ ...lead, nextCallbackAt: next }, { onChanged: reloadAll, onHandedOver: () => router.back() });

  const history = useMemo(() => {
    if (!calls.data || !attempts.data || !messages.data) return null;
    const entries: { key: string; at: string; by: string; tag: string; tagColor: string; title: string; body: string | null; extra?: string }[] = [
      ...calls.data.map((c) => ({ key: `c${c.id}`, at: c.calledAt, by: c.caller.fullName, tag: 'Call', tagColor: colors.ink2, title: CALL_OUTCOME_LABELS[c.outcome], body: c.note })),
      ...attempts.data.map((a) => ({ key: `a${a.id}`, at: a.createdAt, by: a.user.fullName, tag: 'Call started', tagColor: colors.blue, title: 'Dialer opened', body: null })),
      ...messages.data.map((m) => ({
        key: `m${m.id}`,
        at: m.createdAt,
        by: m.user.fullName,
        tag: 'WhatsApp',
        tagColor: colors.green,
        title: m.templateName ?? 'Chat opened',
        body: m.message,
        extra: m.attachments?.length ? `Shared: ${m.attachments.map((a) => a.title).join(', ')}` : undefined,
      })),
      // Optional extra: the rest of the history still shows if these can't load.
      ...(phoneCalls.data ?? []).map((c) => ({
        key: `d${c.id}`,
        at: c.startedAt,
        by: c.user.fullName,
        tag: 'Phone',
        tagColor: colors.blue,
        title: `${DIRECTION_LABELS[c.direction]} · ${c.durationSeconds > 0 ? formatDuration(c.durationSeconds) : 'not connected'}`,
        body: null,
      })),
    ];
    return entries.sort((a, b) => b.at.localeCompare(a.at));
  }, [calls.data, attempts.data, messages.data, phoneCalls.data]);

  return (
    <>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 20 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue]} />}>
        <View style={styles.headRow}>
          <Text testID="lead-name" style={styles.name}>
            {lead.name}
          </Text>
          <StageBadge status={lead.status} stage={lead.stage} />
        </View>

        <View style={styles.actions}>
          <Button testID="call" label={lead.phone} icon="call" onPress={actions.call} style={styles.flex} />
          <Button
            testID="whatsapp"
            label="WhatsApp"
            icon="logo-whatsapp"
            tone="whatsapp"
            onPress={actions.whatsapp}
            onLongPress={actions.whatsappTemplates}
            accessibilityHint={actions.whatsAppLead ? 'Opens the chat. Long press for templates.' : 'Pick a message to send'}
            busy={actions.opening}
            style={styles.flex}
          />
        </View>
        {actions.whatsAppLead && <Text style={styles.hint}>WhatsApp opens their chat. Hold it for templates and files.</Text>}
        <View style={styles.actions}>
          {actions.canLog && <Button testID="log-call" label="Log call" icon="create-outline" tone="secondary" onPress={actions.logCall} style={styles.flex} />}
          {actions.canLog && <Button testID="set-callback" label={next ? 'Move callback' : 'Callback'} icon="alarm-outline" tone="secondary" onPress={actions.callback} style={styles.flex} />}
        </View>
        {actions.canQualify && canBeQualified(lead.status) && <Button testID="qualify" label="Qualify & hand over" icon="sparkles-outline" tone="qualify" onPress={actions.qualify} style={styles.qualify} />}

        <Text style={styles.heading}>Details</Text>
        <View style={styles.card}>
          <Info label="City">{lead.city ?? '-'}</Info>
          <Info label="Product">{productLabel(lead) ?? 'Not known yet'}</Info>
          <Info label="Source">{`${SOURCE_LABELS[lead.source] ?? lead.source}${lead.sourceDetail ? ` · ${lead.sourceDetail}` : ''}`}</Info>
          {lead.email && <Info label="Email">{lead.email}</Info>}
          <Info label="Assigned to">{lead.assignedTo?.fullName ?? 'Unassigned'}</Info>
          <Info label="Created">{formatDateTime(lead.createdAt)}</Info>
          {lead.notes && <Info label="Notes">{lead.notes}</Info>}
        </View>

        <Text style={styles.heading}>Follow-ups</Text>
        <View style={styles.card}>
          {pending.length === 0 && done.length === 0 && <Text style={styles.none}>No follow-ups yet.</Text>}
          {pending.map((f) => (
            <View key={f.id} style={styles.followUp}>
              <Ionicons name="alarm-outline" size={18} color={new Date(f.scheduledAt) < new Date() ? colors.red : colors.blue} />
              <View style={styles.flex}>
                <Text style={[styles.followUpTime, new Date(f.scheduledAt) < new Date() && styles.overdue]}>{formatDateTime(f.scheduledAt)}</Text>
                {f.note && <Text style={styles.activityBody}>{f.note}</Text>}
              </View>
            </View>
          ))}
          {done.map((f) => (
            <View key={f.id} style={styles.followUp}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.ink3} />
              <View style={styles.flex}>
                <Text style={styles.followUpDone}>{formatDateTime(f.scheduledAt)}</Text>
                {f.note && <Text style={styles.meta}>{f.note}</Text>}
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.heading}>Calls and messages{history && history.length > 0 ? ` · ${history.length}` : ''}</Text>
        <ErrorBanner message={calls.error ?? attempts.error ?? messages.error} />
        <View style={styles.card}>
          {!history && !calls.error && <Text style={styles.none}>Loading…</Text>}
          {history?.length === 0 && <Text style={styles.none}>No calls or messages yet.</Text>}
          {history?.map((h) => <Activity key={h.key} tag={h.tag} tagColor={h.tagColor} title={h.title} body={h.body} extra={h.extra} meta={`${formatDateTime(h.at)} · ${h.by}`} />)}
        </View>
      </ScrollView>
      {actions.sheets}
    </>
  );
}

/** Everything about one lead, and the actions on it. */
export function LeadScreen({ id }: { id: string }) {
  const lead = useResource<LeadDetail>(`/leads/${id}`);
  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: lead.data?.name ?? 'Lead' }} />
      {lead.data ? (
        <LeadBody lead={lead.data} id={id} refreshing={lead.refreshing} onRefresh={lead.refresh} reloadLead={lead.reload} />
      ) : lead.error ? (
        <Centered>
          <ErrorBanner message={lead.error} />
          <Button label="Try again" onPress={lead.reload} />
        </Centered>
      ) : (
        <Centered />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  scroll: { padding: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  name: { fontSize: 24, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  qualify: { marginBottom: 8 },
  hint: { fontSize: 13, color: colors.ink3, marginTop: -2, marginBottom: 8, textAlign: 'right' },
  heading: { fontSize: 15, fontWeight: '700', color: colors.navy900, marginTop: 14, marginBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 6 },
  info: { paddingVertical: 8 },
  infoLabel: { fontSize: 12, color: colors.ink3 },
  infoValue: { fontSize: 15, color: colors.ink, marginTop: 1 },
  none: { fontSize: 14, color: colors.ink3, paddingVertical: 10 },
  followUp: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  followUpTime: { fontSize: 15, fontWeight: '600', color: colors.ink },
  followUpDone: { fontSize: 14, color: colors.ink3 },
  overdue: { color: colors.red },
  activity: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  activityTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  activityBody: { fontSize: 14, color: colors.ink2, marginTop: 2 },
  shared: { fontSize: 13, color: colors.green, fontWeight: '600', marginTop: 3 },
  meta: { fontSize: 12, color: colors.ink3, marginTop: 3 },
});
