// Rules for removing a user account (Admin -> Users): what data is attached
// to them, which of their leads are still open, and the last-admin rule.

import type { LeadStatus } from '../generated/prisma/client.js';

export const LAST_ADMIN_MESSAGE = 'At least one admin is required. Make someone else an admin first.';

/** Leads that are still being worked: anything not Won or Lost. */
export const OPEN_LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED'];

/**
 * Every record that points at a user, as Prisma `_count` keys with the words
 * the admin sees. A user with any of these can only be deactivated, never
 * deleted, so their history stays whole. (Their tag overrides, sign-out
 * records, notifications and the user-audit trail don't count: those go with
 * the account or keep the name as text.)
 */
export const ATTACHED_DATA: Record<string, string> = {
  assignedLeads: 'leads assigned to them',
  createdLeads: 'leads they added',
  workedLeads: 'leads they worked as telecaller',
  qualifiedLeads: 'leads they qualified',
  callLogs: 'logged calls',
  deviceCalls: 'synced phone calls',
  createdFollowUps: 'follow-ups',
  leadActivities: 'lead history entries',
  leadNotes: 'shared notes',
  siteVisits: 'site visits',
  createdSiteVisits: 'site visits they recorded',
  libraryFiles: 'library files they uploaded',
  createdApiKeys: 'API keys they created',
  salesOrders: 'sales orders',
  createdSalesOrders: 'sales orders they created',
  recordedPayments: 'payments recorded',
  createdPurchases: 'purchases',
  vendorPayments: 'vendor payments',
  stockMovements: 'stock movements',
  installations: 'installations',
  createdInstallations: 'installations they scheduled',
  serviceJobs: 'service jobs',
  createdServiceJobs: 'service jobs they created',
  serviceFollowUps: 'service follow-ups',
  leaveApplications: 'leave applications',
  leaveDecisions: 'leave decisions',
  absences: 'absences',
  recordedAbsences: 'absences recorded',
  allowances: 'allowances',
  submittedAllowances: 'allowances submitted',
  decidedAllowances: 'allowance decisions',
};

export const ATTACHED_DATA_COUNT = Object.fromEntries(Object.keys(ATTACHED_DATA).map((k) => [k, true])) as Record<string, true>;

/** The non-zero lines, biggest first: [{ label: "logged calls", count: 12 }]. */
export function attachedData(counts: Record<string, number>) {
  return Object.entries(ATTACHED_DATA)
    .map(([key, label]) => ({ key, label, count: counts[key] ?? 0 }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Would this change leave nobody able to run the admin side? True when the
 * user is an active admin and no other active admin exists.
 */
export function wouldRemoveLastAdmin(target: { isActive: boolean; roleKey: string }, otherActiveAdmins: number) {
  return target.isActive && target.roleKey === 'admin' && otherActiveAdmins === 0;
}
