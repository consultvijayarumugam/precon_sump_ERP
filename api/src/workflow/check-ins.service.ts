import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
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

  async checkIn(user: AuthenticatedUser, dto: CheckInDto) {
    const lead = dto.leadId
      ? await this.prisma.lead.findFirst({
          where: { AND: [{ id: dto.leadId }, leadScope(user)] },
          select: { id: true, name: true, city: true },
        })
      : null;
    if (dto.leadId && !lead) throw new NotFoundException('Lead not found');

    const now = new Date();
    const coords = `${dto.latitude.toFixed(5)}, ${dto.longitude.toFixed(5)}`;
    return this.prisma.siteVisit.create({
      data: {
        visitDate: new Date(`${businessDate(now)}T00:00:00Z`),
        personId: user.id,
        createdById: user.id,
        customerName: lead?.name ?? 'Site check-in',
        siteAddress: lead?.city ? `${lead.city} (GPS ${coords})` : `GPS ${coords}`,
        purpose: 'Site visit (GPS check-in)',
        notes: dto.note || null,
        leadId: lead?.id ?? null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMeters: dto.accuracyMeters ?? null,
        checkedInAt: now,
      },
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
