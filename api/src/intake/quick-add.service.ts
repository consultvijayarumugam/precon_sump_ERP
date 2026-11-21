import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { dateOnly, businessToday } from '../finance/finance-utils.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { QuickAddLeadDto } from './dto/quick-add.dto.js';
import { normalizeLeadPhone, PHONE_HELP, phoneMatchKey } from './intake-parsing.js';
import { businessDayRange, LeadAssignmentService } from './lead-assignment.service.js';
import { LeadIntakeService, OPEN_STATUSES } from './lead-intake.service.js';

/** How quick-added leads are labelled, and how they're counted. */
export const QUICK_ADD_DETAIL = 'Quick add (WhatsApp enquiry)';


/**
 * Logging click-to-WhatsApp ad enquiries fast: a phone number (and maybe a
 * name and their first message) becomes a WhatsApp lead, shared round-robin
 * with the telecallers. A number that's already an open lead is flagged, not added.
 */
@Injectable()
export class QuickAddService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: LeadIntakeService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  async add(user: AuthenticatedUser, dto: QuickAddLeadDto) {
    const phone = normalizeLeadPhone(dto.phone);
    if (!phone) throw new BadRequestException(`"${dto.phone}" isn't a phone number. ${PHONE_HELP}`);
    const result = await this.intake.create({
      name: dto.name || null,
      phone,
      source: 'WHATSAPP',
      productInterest: null,
      notes: dto.note || null,
      rotation: await this.assignment.rotationIds(),
      createdById: user.id,
      sourceDetail: QUICK_ADD_DETAIL,
      duplicates: 'open',
    });
    const addedToday = await this.addedToday(user.id);

    if (result.status === 'duplicate') {
      const { id, name, phone: existingPhone, status, assignedTo } = result.existing;
      return { status: 'duplicate' as const, phone, existing: { id, name, phone: existingPhone, status, assignedTo }, addedToday };
    }
    // A past customer (Won or Lost) asking again: a new lead, with a pointer to the old one.
    const previous = await this.prisma.lead.findFirst({
      where: { id: { not: result.leadId }, phone: { endsWith: phoneMatchKey(phone) }, status: { notIn: OPEN_STATUSES } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, phone: true, status: true },
    });
    return {
      status: 'created' as const,
      lead: { id: result.leadId, name: dto.name || null, phone },
      assignedTo: result.assignedTo,
      previous,
      addedToday,
    };
  }

  /** Your count for today, everyone's, and how today's leads are spread across the telecallers. */
  async today(user: AuthenticatedUser) {
    const today = dateOnly(businessToday());
    const { start, end } = businessDayRange(today);
    const [addedByYou, addedByEveryone, split] = await Promise.all([
      this.addedToday(user.id),
      this.prisma.lead.count({ where: { sourceDetail: QUICK_ADD_DETAIL, createdAt: { gte: start, lt: end } } }),
      this.assignment.distribution(today),
    ]);
    return {
      date: today,
      addedByYou,
      addedByEveryone,
      nextUp: split.nextUp,
      telecallers: split.members.map((m) => ({ id: m.id, fullName: m.fullName, inRotation: m.autoAssignEnabled, leadsToday: m.leads })),
    };
  }

  private addedToday(userId: string) {
    const { start, end } = businessDayRange(dateOnly(businessToday()));
    return this.prisma.lead.count({ where: { createdById: userId, sourceDetail: QUICK_ADD_DETAIL, createdAt: { gte: start, lt: end } } });
  }
}
