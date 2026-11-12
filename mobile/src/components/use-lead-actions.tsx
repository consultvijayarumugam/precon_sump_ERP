import { ReactNode, useState } from 'react';
import { Linking, ToastAndroid } from 'react-native';
import { markCallPlaced } from '../call-sync';
import { telNumber } from '../lib/phone';
import type { ProductInterest } from '../lib/workflow';
import { useSession, useUser } from '../session';
import { CallbackSheet, LogCallSheet, QualifySheet, WhatsAppSheet } from './sheets';

export interface ActionLead {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  productInterest: ProductInterest | null;
  sumpSizeLitres: number | null;
  nextCallbackAt: string | null;
  /** WHATSAPP leads open their chat in one tap. */
  source?: string;
}

type Open = 'log' | 'callback' | 'qualify' | 'whatsapp' | null;

/**
 * Call, WhatsApp, log outcome, callback and qualify for one lead, shared by
 * the worklist and the lead page. Render `sheets` once alongside the buttons.
 */
export function useLeadActions(lead: ActionLead, handlers: { onChanged: () => void; onHandedOver?: () => void }) {
  const { api } = useSession();
  const { can } = useUser();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const canLog = can('followups.write');
  const [opening, setOpening] = useState(false);
  const whatsAppLead = lead.source === 'WHATSAPP';

  /**
   * WhatsApp leads came from a chat, so one tap goes straight back to it. The
   * server logs it on the lead ("Chat opened") and gives the wa.me link.
   * If that fails, the template sheet opens instead so they're never stuck.
   */
  async function openChat() {
    if (opening) return;
    setOpening(true);
    try {
      const { url } = await api<{ url: string }>(`/leads/${lead.id}/whatsapp`, { method: 'POST', body: {} });
      await Linking.openURL(url);
      handlers.onChanged();
    } catch (err) {
      ToastAndroid.show(err instanceof Error ? err.message : 'Could not open WhatsApp', ToastAndroid.LONG);
      setOpen('whatsapp');
    } finally {
      setOpening(false);
    }
  }

  /** Opens the dialer and logs the attempt; the outcome sheet is waiting when they come back. */
  function call() {
    const tel = telNumber(lead.phone);
    if (!tel) {
      ToastAndroid.show(`${lead.phone} can't be dialled`, ToastAndroid.SHORT);
      return;
    }
    if (canLog) setOpen('log');
    markCallPlaced();
    api(`/leads/${lead.id}/call-attempts`, { method: 'POST' }).then(handlers.onChanged, () => undefined); // never get in the way of the call
    Linking.openURL(`tel:${tel}`).catch(() => ToastAndroid.show('This phone could not open the dialer', ToastAndroid.LONG));
  }

  let sheets: ReactNode = null;
  if (open === 'log') {
    sheets = (
      <LogCallSheet
        leadId={lead.id}
        leadName={lead.name}
        onClose={close}
        onDone={({ interested }) => {
          handlers.onChanged();
          setOpen(interested && can('leads.qualify') ? 'qualify' : null);
        }}
      />
    );
  } else if (open === 'callback') {
    sheets = (
      <CallbackSheet
        leadId={lead.id}
        leadName={lead.name}
        current={lead.nextCallbackAt}
        onClose={close}
        onDone={() => {
          close();
          handlers.onChanged();
        }}
      />
    );
  } else if (open === 'qualify') {
    sheets = (
      <QualifySheet
        lead={lead}
        onClose={close}
        onDone={(handedTo) => {
          close();
          ToastAndroid.show(`${lead.name} handed to ${handedTo}`, ToastAndroid.LONG);
          handlers.onChanged();
          handlers.onHandedOver?.();
        }}
      />
    );
  } else if (open === 'whatsapp') {
    sheets = (
      <WhatsAppSheet
        leadId={lead.id}
        leadName={lead.name}
        onClose={close}
        onDone={() => {
          close();
          handlers.onChanged();
        }}
      />
    );
  }

  return {
    call,
    whatsapp: whatsAppLead ? () => void openChat() : () => setOpen('whatsapp'),
    /** The template sheet, also on a long press of a one-tap button. */
    whatsappTemplates: () => setOpen('whatsapp'),
    whatsAppLead,
    opening,
    logCall: () => setOpen('log'),
    callback: () => setOpen('callback'),
    qualify: () => setOpen('qualify'),
    sheets,
    canLog,
    canQualify: can('leads.qualify'),
  };
}
