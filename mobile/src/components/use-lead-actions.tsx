import { ReactNode, useState } from 'react';
import { Linking, ToastAndroid } from 'react-native';
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

  /** Opens the dialer and logs the attempt; the outcome sheet is waiting when they come back. */
  function call() {
    const tel = telNumber(lead.phone);
    if (!tel) {
      ToastAndroid.show(`${lead.phone} can't be dialled`, ToastAndroid.SHORT);
      return;
    }
    if (canLog) setOpen('log');
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

  return { call, whatsapp: () => setOpen('whatsapp'), logCall: () => setOpen('log'), callback: () => setOpen('callback'), qualify: () => setOpen('qualify'), sheets, canLog, canQualify: can('leads.qualify') };
}
