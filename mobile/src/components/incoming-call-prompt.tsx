import { useEffect, useRef, useState } from 'react';
import { ToastAndroid } from 'react-native';
import { getPrompts, onPromptsChanged, removePrompt } from '../call-sync';
import type { OutcomePrompt } from '../lib/call-sync';
import type { LeadDetail } from '../lib/workflow';
import { useSession, useUser } from '../session';
import { useLeadActions } from './use-lead-actions';

/** One incoming call: the usual outcome form (then qualify, if Interested), dated when the call happened. */
function PromptFlow({ prompt, lead, onFinished }: { prompt: OutcomePrompt; lead: LeadDetail; onFinished: (logged: boolean) => void }) {
  const logged = useRef(false);
  const opened = useRef(false);
  const actions = useLeadActions(
    {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      city: lead.city,
      productInterest: lead.productInterest,
      sumpSizeLitres: lead.sumpSizeLitres,
      nextCallbackAt: lead.followUps.filter((f) => !f.completedAt).at(-1)?.scheduledAt ?? null,
      source: lead.source,
    },
    {
      onChanged: () => {
        logged.current = true;
      },
    },
    { incomingCall: { calledAt: prompt.startedAt, durationSeconds: prompt.durationSeconds } },
  );
  const { logCall, sheetOpen } = actions;

  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      logCall();
    } else if (!sheetOpen) {
      onFinished(logged.current); // saved (and qualified, if they went on), or skipped
    }
  }, [sheetOpen, logCall, onFinished]);

  return <>{actions.sheets}</>;
}

/**
 * When call sync finds an answered incoming call from one of your open leads
 * that you haven't logged, asks "How did the call go?" for it, one call at a
 * time, over whichever tab is open. Skipping drops it; the call itself is
 * already on the lead (direction and duration) either way.
 */
export function IncomingCallPrompts() {
  const { api } = useSession();
  const { user, can } = useUser();
  const [queue, setQueue] = useState<OutcomePrompt[]>([]);
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const current = queue[0] ?? null;
  // The queue is re-read when another sync adds calls: key on the call, not the object, so an open form stays open.
  const currentKey = current ? `${current.leadId}@${current.startedAt}` : null;
  const currentRef = useRef(current);
  currentRef.current = current;
  const canLog = can('followups.write') && (can('leads.write') || can('leads.qualify'));

  useEffect(() => {
    if (!canLog) return;
    const refresh = () => void getPrompts(user.id).then(setQueue);
    refresh();
    return onPromptsChanged(refresh);
  }, [user.id, canLog]);

  // Load the lead for the call at the front of the queue (it may have changed since the call).
  useEffect(() => {
    setLead(null);
    const prompt = currentRef.current;
    if (!currentKey || !prompt) return;
    let alive = true;
    api<LeadDetail>(`/leads/${prompt.leadId}`)
      .then((l) => alive && setLead(l))
      .catch(() => alive && void removePrompt(user.id, prompt)); // gone or no longer yours: nothing to ask
    return () => {
      alive = false;
    };
  }, [api, currentKey, user.id]);

  if (!current || !lead || lead.id !== current.leadId) return null;
  return (
    <PromptFlow
      key={currentKey!}
      prompt={current}
      lead={lead}
      onFinished={(saved) => {
        if (saved) ToastAndroid.show(`Call with ${lead.name} logged`, ToastAndroid.SHORT);
        void removePrompt(user.id, current);
      }}
    />
  );
}
