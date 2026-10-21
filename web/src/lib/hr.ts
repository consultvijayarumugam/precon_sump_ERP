// HR types and labels, mirroring the API (leave, holidays, LOP, allowances).
import type { UserRef } from "./crm";

export const LEAVE_TYPES = ["CASUAL", "SICK", "UNPAID"] as const;
export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const ALLOWANCE_TYPES = ["TRAVEL", "FOOD", "SITE", "OTHER"] as const;
export const ALLOWANCE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export type AllowanceType = (typeof ALLOWANCE_TYPES)[number];
export type AllowanceStatus = (typeof ALLOWANCE_STATUSES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = { CASUAL: "Casual", SICK: "Sick", UNPAID: "Unpaid (LOP)" };
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
export const ALLOWANCE_TYPE_LABELS: Record<AllowanceType, string> = {
  TRAVEL: "Travel",
  FOOD: "Food",
  SITE: "Site",
  OTHER: "Other",
};

export interface LeaveApplication {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  days: number;
  workingDates: string[];
  user: { id: string; fullName: string; role: { name: string } };
  decidedBy: UserRef | null;
}

export interface LeaveBalance {
  year: number;
  paid: { type: "CASUAL" | "SICK"; entitlement: number; taken: number; pending: number; remaining: number; available: number }[];
  unpaid: { taken: number; pending: number };
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface TeamCalendar {
  from: string;
  to: string;
  holidays: { date: string; name: string }[];
  leave: {
    id: string;
    user: UserRef;
    startDate: string;
    endDate: string;
    status: LeaveStatus;
    workingDates: string[];
    type: LeaveType | null; // hidden unless approver or yourself
  }[];
}

export interface LopRow {
  employee: { id: string; fullName: string; role: { name: string } };
  workingDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentWithoutApproval: number;
  lopDays: number;
  presentEquivalent: number;
  paidDays: number;
  pendingLeaveDays: number;
  lopDates: { date: string; reason: "UNPAID_LEAVE" | "ABSENT_WITHOUT_APPROVAL"; note: string | null; absenceId?: string }[];
}

export interface LopSummary {
  month: string;
  workingDays: number;
  holidays: { date: string; name: string }[];
  rows: LopRow[];
  totals: { lopDays: number; employeesWithLop: number; pendingLeaveDays: number };
}

export interface Allowance {
  id: string;
  type: AllowanceType;
  amount: string;
  date: string;
  description: string;
  status: AllowanceStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  user: UserRef;
  submittedBy: UserRef;
  decidedBy: UserRef | null;
  siteVisit: { id: string; customerName: string; visitDate: string; purpose: string } | null;
  installation: { id: string; customerName: string; orderNumberLabel: string } | null;
}

export interface AllowanceSummary {
  month: string;
  rows: {
    employee: UserRef;
    entries: number;
    approvedTotal: string;
    pendingTotal: string;
    approvedByType: Record<AllowanceType, string>;
  }[];
  totals: { approved: string; pending: string };
}

export interface Employee {
  id: string;
  fullName: string;
  role: { name: string };
}

/** "2026-10" for the current local month, and helpers to move between months. */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
export const formatMonth = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00`));
