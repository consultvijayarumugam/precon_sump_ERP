// Installation, service and site-visit types and labels, mirroring the API.
import type { ProductInterest, UserRef } from "./crm";
import type { OrderStatus } from "./finance";

export const INSTALLATION_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] as const;
export const JOB_TYPES = ["COMPLAINT", "MAINTENANCE", "WARRANTY"] as const;
export const JOB_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
export const JOB_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export const SERVICE_OUTCOMES = [
  "CONNECTED",
  "NO_ANSWER",
  "SITE_VISITED",
  "PARTS_PENDING",
  "FIXED",
  "CUSTOMER_SATISFIED",
  "OTHER",
] as const;
export const TAG_COLORS = ["slate", "sky", "green", "amber", "red", "violet", "pink", "teal"] as const;

export type InstallationStatus = (typeof INSTALLATION_STATUSES)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type JobPriority = (typeof JOB_PRIORITIES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type ServiceOutcome = (typeof SERVICE_OUTCOMES)[number];
export type TagColor = (typeof TAG_COLORS)[number];

export const INSTALLATION_STATUS_LABELS: Record<InstallationStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};
export const JOB_TYPE_LABELS: Record<JobType, string> = {
  COMPLAINT: "Complaint",
  MAINTENANCE: "Maintenance",
  WARRANTY: "Warranty",
};
export const JOB_PRIORITY_LABELS: Record<JobPriority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};
export const SERVICE_OUTCOME_LABELS: Record<ServiceOutcome, string> = {
  CONNECTED: "Spoke to customer",
  NO_ANSWER: "No answer",
  SITE_VISITED: "Site visited",
  PARTS_PENDING: "Waiting for parts",
  FIXED: "Fixed",
  CUSTOMER_SATISFIED: "Customer satisfied",
  OTHER: "Other",
};

export interface Installation {
  id: string;
  scheduledDate: string;
  teamName: string | null;
  siteAddress: string;
  notes: string | null;
  status: InstallationStatus;
  startedAt: string | null;
  completedAt: string | null;
  completionNotes: string | null;
  createdAt: string;
  isLate: boolean;
  serviceJobCount: number;
  assignedTo: UserRef | null;
  createdBy: UserRef;
  salesOrder: {
    id: string;
    orderNumber: number;
    orderNumberLabel: string;
    customerName: string;
    status: OrderStatus;
    quantity: number;
    product: { code: ProductInterest; sizeLitres: number | null; name: string; unit: string };
    lead: { phone: string; city: string | null };
    salesperson: UserRef;
  };
}

export interface InstallationDetail extends Installation {
  serviceJobs: { id: string; jobNumberLabel: string; type: JobType; status: JobStatus; priority: JobPriority }[];
}

export interface ServiceJob {
  id: string;
  jobNumber: number;
  jobNumberLabel: string;
  type: JobType;
  priority: JobPriority;
  status: JobStatus;
  description: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  assignedTo: UserRef | null;
  createdBy: UserRef;
  customer: { name: string; phone: string; siteAddress: string; product: string; salesperson: UserRef };
  installation: { id: string; completedAt: string | null };
  salesOrder: { id: string; orderNumberLabel: string };
  nextFollowUpAt?: string | null;
}

export interface ServiceFollowUp {
  id: string;
  scheduledAt: string;
  note: string | null;
  outcome: ServiceOutcome | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: UserRef;
}

export interface ServiceJobDetail extends ServiceJob {
  followUps: ServiceFollowUp[];
}

export interface ServiceFollowUpWithJob extends ServiceFollowUp {
  serviceJob: {
    id: string;
    jobNumberLabel: string;
    type: JobType;
    priority: JobPriority;
    status: JobStatus;
    customerName: string;
    phone: string;
    assignedTo: UserRef | null;
  };
}

export interface SiteVisitTag {
  id: string;
  name: string;
  description: string | null;
  color: TagColor;
  isActive: boolean;
  visitCount?: number;
}

export interface SiteVisit {
  id: string;
  visitDate: string;
  customerName: string;
  siteAddress: string;
  purpose: string;
  notes: string | null;
  createdAt: string;
  person: UserRef;
  createdBy: UserRef;
  tags: SiteVisitTag[];
  installation: { id: string; status: InstallationStatus; orderNumberLabel: string } | null;
}

export interface Person {
  id: string;
  fullName: string;
  role: { name: string };
}
