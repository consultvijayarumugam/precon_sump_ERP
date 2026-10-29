import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { recordActivity } from '../crm/lead-history.js';
import { leadScope } from '../crm/lead-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { businessDate } from './business-periods.js';
import { CheckInDto } from './dto/workflow.dto.js';

export const CHECK_IN_SELECT = {
  id: true,
  visitDate: true,
  customerName: true,
  siteAddress: true,
  notes: true,
  latitude: true,
  longitude: true,
  accuracyMeters: true,
  checkedInAt: true,
  person: { select: { id: true, fullName: true } },
  lead: { select: { id: true, name: true, status: true } },
} as const;

/**
 * "I'm at site": one GPS reading taken in the browser when the salesperson
 * taps the button, stored on a site visit and shown as a pin on an
 * OpenStreetMap map. Point-in-time only; there is no live tracking.
 */
@Injectable()
export class CheckInsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A visit is always for one of the salesperson's own leads (assigned to them).
   * It's stored on that lead, so it shows in the lead's history and on its page.
   */
  async checkIn(user: AuthenticatedUser, dto: CheckInDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, assignedToId: user.id },
      select: { id: true, name: true, city: true },
    });
    if (!lead) throw new NotFoundException('Pick one of your own leads for this visit');

    const now = new Date();
    const coords = `${dto.latitude.toFixed(5)}, ${dto.longitude.toFixed(5)}`;
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.siteVisit.create({
        data: {
          visitDate: new Date(`${businessDate(now)}T00:00:00Z`),
          personId: user.id,
          createdById: user.id,
          customerName: lead.name,
          siteAddress: lead.city ? `${lead.city} (GPS ${coords})` : `GPS ${coords}`,
          purpose: 'Site visit (GPS check-in)',
          notes: dto.note || null,
          leadId: lead.id,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracyMeters: dto.accuracyMeters ?? null,
          checkedInAt: now,
        },
        select: CHECK_IN_SELECT,
      });
      await recordActivity(tx, {
        leadId: lead.id,
        userId: user.id,
        type: 'SITE_VISIT',
        summary: `Site visit (GPS ${coords}${dto.accuracyMeters !== undefined ? `, ±${dto.accuracyMeters} m` : ''})${dto.note ? ` · ${dto.note}` : ''}`,
        at: now,
      });
      return visit;
    });
  }

  /** The leads a salesperson can pick for a visit: their own, not closed as lost. */
  visitableLeads(user: AuthenticatedUser) {
    return this.prisma.lead.findMany({
      where: { assignedToId: user.id, status: { not: 'LOST' } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      take: 300,
      select: { id: true, name: true, city: true, status: true },
    });
  }

  /** Visits recorded on one lead (anyone who can see the lead). */
  async forLead(user: AuthenticatedUser, leadId: string) {
    const visible = await this.prisma.lead.count({ where: { AND: [{ id: leadId }, leadScope(user)] } });
    if (!visible) throw new NotFoundException('Lead not found');
    return this.prisma.siteVisit.findMany({
      where: { leadId, latitude: { not: null } },
      orderBy: { checkedInAt: 'desc' },
      take: 50,
      select: CHECK_IN_SELECT,
    });
  }

  /** Check-ins with a location, newest first: yours, or everyone's for the master view. */
  recent(opts: { personId?: string; since?: Date; take?: number }) {
    return this.prisma.siteVisit.findMany({
      where: {
        personId: opts.personId,
        latitude: { not: null },
        checkedInAt: { gte: opts.since },
      },
      orderBy: { checkedInAt: 'desc' },
      take: opts.take ?? 20,
      select: CHECK_IN_SELECT,
    });
  }
}
