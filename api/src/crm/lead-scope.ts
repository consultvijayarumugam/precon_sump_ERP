import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import type { Prisma } from '../generated/prisma/client.js';
import { businessDayRange } from '../intake/lead-assignment.service.js';

/**
 * Which leads a user may see or touch. Driven by tags, not role names:
 *   leads.read_all     -> every lead (including unassigned)
 *   leads.auto_assign  -> leads assigned to them, plus leads they worked as the
 *                         telecaller (still theirs to see and edit after they
 *                         hand them to a salesperson)
 *   otherwise          -> only leads assigned to them (a salesperson sees only
 *                         the leads handed to them)
 * Follow-ups, calls and site visits inherit the scope of their lead.
 */
export function leadScope(user: AuthenticatedUser): Prisma.LeadWhereInput {
  if (user.permissions.includes(PERMISSIONS.LEADS_READ_ALL)) return {};
  if (user.permissions.includes(PERMISSIONS.LEADS_AUTO_ASSIGN)) {
    return { OR: [{ assignedToId: user.id }, { telecallerId: user.id }] };
  }
  return { assignedToId: user.id };
}

/** Leads the user is responsible for right now (their own follow-up list, calendar, reminders). */
export function ownedLeads(user: AuthenticatedUser): Prisma.LeadWhereInput {
  return user.permissions.includes(PERMISSIONS.LEADS_READ_ALL) ? {} : { assignedToId: user.id };
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
  sourceDetail: true,
  autoAssigned: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, fullName: true } },
  // The telecaller who worked it, and the handover (who qualified it, when).
  telecaller: { select: { id: true, fullName: true } },
  qualifiedAt: true,
  qualifiedBy: { select: { id: true, fullName: true } },
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

/**
 * A from/to pair of business days (YYYY-MM-DD, both inclusive) as a filter on
 * an instant column. Either end may be left open. 400 if "to" is before "from".
 */
export function dayRangeFilter(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  if (from && to && to < from) throw new BadRequestException('The end date is before the start date');
  return {
    gte: from ? businessDayRange(from).start : undefined,
    lt: to ? businessDayRange(to).end : undefined,
  };
}
