// CRM types and display labels, mirroring the API's enums.

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "LOST"] as const;
export const LEAD_SOURCES = ["META", "MANUAL", "WEBSITE", "REFERRAL", "OTHER"] as const;
export const PRODUCT_INTERESTS = ["UG_SUMP", "BIO_SEPTIC_TANK", "MICROBES", "PRECAST"] as const;
export const FOLLOW_UP_OUTCOMES = [
  "CONNECTED",
  "NO_ANSWER",
  "CALL_BACK",
  "INTERESTED",
  "NOT_INTERESTED",
  "QUOTE_SENT",
  "OTHER",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type ProductInterest = (typeof PRODUCT_INTERESTS)[number];
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  META: "Meta (Facebook)",
  MANUAL: "Manual",
  WEBSITE: "Website",
  REFERRAL: "Referral",
  OTHER: "Other",
};

export const PRODUCT_LABELS: Record<ProductInterest, string> = {
  UG_SUMP: "UG sump",
  BIO_SEPTIC_TANK: "Bio-septic tank",
  MICROBES: "Microbes",
  PRECAST: "Precast",
};

export const OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  CONNECTED: "Connected",
  NO_ANSWER: "No answer",
  CALL_BACK: "Call back later",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not interested",
  QUOTE_SENT: "Quote sent",
  OTHER: "Other",
};

export interface UserRef {
  id: string;
  fullName: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  source: LeadSource;
  productInterest: ProductInterest;
  status: LeadStatus;
  notes: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: UserRef | null;
  createdBy: UserRef;
  salesOrder: { id: string; orderNumber: number; status: "CONFIRMED" | "DELIVERED" | "CANCELLED" } | null;
}

export interface LeadListItem extends Lead {
  nextFollowUpAt: string | null;
}

export interface FollowUp {
  id: string;
  scheduledAt: string;
  note: string | null;
  outcome: FollowUpOutcome | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: UserRef;
}

export interface FollowUpWithLead extends FollowUp {
  lead: {
    id: string;
    name: string;
    phone: string;
    status: LeadStatus;
    productInterest: ProductInterest;
    assignedTo: UserRef | null;
  };
}

export interface LeadDetail extends Lead {
  followUps: FollowUp[];
}

export interface Paginated<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface CrmSummary {
  totalLeads: number;
  openLeads: number;
  leadsByStatus: Record<LeadStatus, number>;
  overdueFollowUps: number;
  upcomingFollowUps: number;
}

export { TAGS } from "./tags";

export function isOverdue(f: Pick<FollowUp, "completedAt" | "scheduledAt">): boolean {
  return !f.completedAt && new Date(f.scheduledAt).getTime() < Date.now();
}

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

/** For <input type="datetime-local">: Date -> "YYYY-MM-DDTHH:mm" in local time. */
export function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Local calendar day key, e.g. "2026-10-21". */
export function dayKey(date: Date): string {
  return toDateTimeLocal(date).slice(0, 10);
}
