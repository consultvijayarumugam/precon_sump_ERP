// Types and labels for the telecaller → sales workflow (calls, callbacks,
// qualification, GPS check-ins) and the three role dashboards.
import type { LeadSource, LeadStatus, ProductInterest, UserRef } from "@/lib/crm";

export const CALL_OUTCOMES = ["NO_ANSWER", "BUSY", "CALL_BACK", "INTERESTED", "NOT_INTERESTED", "WRONG_NUMBER"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  NO_ANSWER: "No answer",
  BUSY: "Busy",
  CALL_BACK: "Call back later",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not interested",
  WRONG_NUMBER: "Wrong number",
};

/** These close the lead as Lost (and it leaves the worklist). */
export const CLOSING_OUTCOMES: CallOutcome[] = ["NOT_INTERESTED", "WRONG_NUMBER"];

export type WorklistBucket = "overdue" | "today" | "new" | "no_next_step" | "later";

export const BUCKET_LABELS: Record<WorklistBucket, string> = {
  overdue: "Overdue callbacks",
  today: "Callbacks due today",
  new: "New: not called yet",
  no_next_step: "Called, no callback set",
  later: "Callbacks later",
};

export interface WorklistItem {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  status: LeadStatus;
  source: LeadSource;
  sourceDetail: string | null;
  productInterest: ProductInterest | null;
  sumpSizeLitres: number | null;
  notes: string | null;
  createdAt: string;
  bucket: WorklistBucket;
  nextCallback: { id: string; scheduledAt: string; note: string | null } | null;
  lastCall: { outcome: CallOutcome; note: string | null; calledAt: string } | null;
  callCount: number;
}

export interface TelecallerDashboardData {
  counts: {
    newToday: number;
    callbacksDueToday: number;
    overdue: number;
    callsToday: number;
    callsThisWeek: number;
    qualifiedToday: number;
    qualifiedThisWeek: number;
    notCalledYet: number;
  };
  items: WorklistItem[];
}

export interface CheckIn {
  id: string;
  visitDate: string;
  customerName: string;
  siteAddress: string;
  notes: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  checkedInAt: string;
  person: UserRef;
  lead: { id: string; name: string; status: LeadStatus } | null;
}

export interface SalesLead {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  status: LeadStatus;
  productInterest: ProductInterest | null;
  sumpSizeLitres: number | null;
  qualifiedAt: string | null;
  closedAt: string | null;
  qualifiedBy: UserRef | null;
  nextFollowUp: { id: string; scheduledAt: string; note: string | null } | null;
}

export interface SalesDashboardData {
  pipeline: { QUALIFIED: number; QUOTED: number; WON: number; LOST: number; wonThisMonth: number; lostThisMonth: number };
  revenueThisMonth: string | null;
  handedToday: number;
  open: SalesLead[];
  closedThisMonth: SalesLead[];
  followUps: {
    id: string;
    scheduledAt: string;
    note: string | null;
    overdue: boolean;
    lead: { id: string; name: string; phone: string; status: LeadStatus; city: string | null };
  }[];
  visits: CheckIn[];
}

export interface Flag {
  severity: "high" | "medium";
  personId: string;
  person: string;
  role: "Telecaller" | "Sales";
  message: string;
  count: number;
  href: string;
}

export interface MasterDashboardData {
  today: {
    total: number;
    autoAssigned: number;
    unassigned: number;
    spread: number;
    nextUp: { id: string; fullName: string } | null;
    members: { id: string; fullName: string; autoAssignEnabled: boolean; leads: number }[];
  };
  team: {
    incomingToday: number;
    callsToday: number;
    notCalled: number;
    overdue: number;
    qualifiedToday: number;
    wonMonth: number;
    revenueMonth: string;
  };
  telecallers: {
    id: string;
    fullName: string;
    inRotation: boolean;
    receivedToday: number;
    active: number;
    notCalled: number;
    oldestNotCalledAt: string | null;
    overdueCallbacks: number;
    callsToday: number;
    callsWeek: number;
    receivedMonth: number;
    qualifiedMonth: number;
    conversionRate: number | null;
  }[];
  sales: {
    id: string;
    fullName: string;
    inRotation: boolean;
    receivedMonth: number;
    open: number;
    wonMonth: number;
    revenueMonth: string;
    followUpsOverdue: number;
    noNextStep: number;
    followUpCompliance: number | null;
  }[];
  flags: Flag[];
  visits: CheckIn[];
  /** The owner's morning view (CEO dashboard). */
  overview: {
    leadFlow: {
      today: number;
      yesterday: number;
      thisWeek: number;
      lastWeekSameTime: number;
      bySource: { source: LeadSource; thisWeek: number; lastWeek: number }[];
      daily: { date: string; leads: number }[];
    };
    activity: {
      callsToday: number;
      callsYesterday: number;
      /** Yesterday up to the same time of day. */
      callsYesterdaySoFar: number;
      leadsWorkedToday: number;
      leadsWorkedYesterday: number;
      followUpsDueMonth: number;
      followUpsDoneMonth: number;
      followUpCompliance: number | null;
    };
    pipeline: {
      active: number;
      stages: { status: "NEW" | "CONTACTED" | "QUALIFIED" | "QUOTED"; leads: number }[];
      qualifiedYesterday: number;
    };
    revenue: {
      monthToDate: string;
      lastMonthSameDays: string;
      lastMonthTotal: string;
      wonMonthToDate: number;
      wonLastMonthSameDays: number;
    };
  };
}

export const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

/** Value for a datetime-local input, in local time. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Quick callback times: in 1 hour, this evening 6 pm (if still ahead), tomorrow 11 am, in 2 days. */
export function callbackPresets(now = new Date()): { label: string; at: Date }[] {
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  inHour.setSeconds(0, 0);
  const evening = new Date(now);
  evening.setHours(18, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);
  const twoDays = new Date(tomorrow);
  twoDays.setDate(twoDays.getDate() + 1);
  return [
    { label: "In 1 hour", at: inHour },
    ...(evening.getTime() - now.getTime() > 60 * 60 * 1000 ? [{ label: "Today 6 pm", at: evening }] : []),
    { label: "Tomorrow 11 am", at: tomorrow },
    { label: "In 2 days", at: twoDays },
  ];
}
