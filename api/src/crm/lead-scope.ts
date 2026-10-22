import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Which leads a user may see or touch. Driven by tags, not role names:
 *   leads.read_all -> every lead (including unassigned)
 *   otherwise      -> only leads assigned to them
 * Follow-ups inherit the scope of their lead.
 */
export function leadScope(user: AuthenticatedUser): Prisma.LeadWhereInput {
  return user.permissions.includes(PERMISSIONS.LEADS_READ_ALL)
    ? {}
    : { assignedToId: user.id };
}

export function canAssignLeads(user: AuthenticatedUser): boolean {
  return user.permissions.includes(PERMISSIONS.LEADS_ASSIGN);
}

/** Fields returned for a lead in lists and on its detail page. */
export const LEAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  city: true,
  source: true,
  productInterest: true,
  sumpSizeLitres: true,
  status: true,
  notes: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  salesOrder: { select: { id: true, orderNumber: true, status: true } },
} satisfies Prisma.LeadSelect;

export const FOLLOW_UP_SELECT = {
  id: true,
  scheduledAt: true,
  note: true,
  outcome: true,
  completedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.FollowUpSelect;
