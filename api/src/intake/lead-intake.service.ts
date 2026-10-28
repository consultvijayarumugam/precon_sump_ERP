import { Injectable } from '@nestjs/common';
import { LeadSource, LeadStatus, Prisma, ProductInterest } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { phoneMatchKey } from './intake-parsing.js';
import { Assignee, LeadAssignmentService } from './lead-assignment.service.js';

export interface IntakeLead {
  name: string;
  phone: string; // already normalised
  email?: string | null;
  city?: string | null;
  source: LeadSource;
  /** Null = not known yet; the telecaller finds out. */
  productInterest: ProductInterest | null;
  sumpSizeLitres?: number | null;
  notes?: string | null;
  /** A chosen assignee. Leave it null to use the round-robin (see `rotation`). */
  assignedToId?: string | null;
  /**
   * Ids of the users in the round-robin (LeadAssignmentService.rotationIds()).
   * When given and no assignee was chosen, the next one in turn gets the lead.
   */
  rotation?: string[];
  createdById: string;
  sourceDetail: string;
  externalRef?: string | null;
}

export type IntakeResult =
  | { status: 'created'; leadId: string; assignedTo: Assignee | null; autoAssigned: boolean }
  | { status: 'duplicate'; reason: 'phone' | 'externalRef'; leadId: string; existingName: string };

/**
 * The one place leads arrive from outside (import, public API, Meta webhook).
 * Duplicates are SKIPPED, never created twice:
 *   - same externalRef (the same submission sent again), or
 *   - a lead whose phone has the same last 10 digits.
 * New leads without a chosen assignee go to the next telecaller in the
 * round-robin; a skipped duplicate doesn't use up anyone's turn.
 */
@Injectable()
export class LeadIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  async findDuplicate(phone: string, externalRef?: string | null) {
    if (externalRef) {
      const byRef = await this.prisma.lead.findUnique({ where: { externalRef }, select: { id: true, name: true } });
      if (byRef) return { reason: 'externalRef' as const, lead: byRef };
    }
    const byPhone = await this.prisma.lead.findFirst({
      where: { phone: { endsWith: phoneMatchKey(phone) } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    return byPhone ? { reason: 'phone' as const, lead: byPhone } : null;
  }

  async create(input: IntakeLead): Promise<IntakeResult> {
    const dup = await this.findDuplicate(input.phone, input.externalRef);
    if (dup) return { status: 'duplicate', reason: dup.reason, leadId: dup.lead.id, existingName: dup.lead.name };

    const chosenId = input.assignedToId ?? null;
    let created: { leadId: string; assignedTo: Assignee | null; autoAssigned: boolean };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // Round-robin only when nobody was chosen; the pick and the lead commit together.
        const auto = chosenId || !input.rotation ? null : await this.assignment.pickNext(tx, input.rotation);
        const lead = await tx.lead.create({
          data: {
            name: input.name,
            phone: input.phone,
            email: input.email || null,
            city: input.city || null,
            source: input.source,
            productInterest: input.productInterest,
            sumpSizeLitres: input.productInterest === 'SUMP' ? (input.sumpSizeLitres ?? null) : null,
            status: LeadStatus.NEW,
            notes: input.notes || null,
            assignedToId: chosenId ?? auto?.id ?? null,
            autoAssigned: Boolean(auto),
            // Who works it: the round-robin pick, or a telecaller in the rotation named in the file.
            telecallerId: auto?.id ?? (chosenId && input.rotation?.includes(chosenId) ? chosenId : null),
            createdById: input.createdById,
            sourceDetail: input.sourceDetail,
            externalRef: input.externalRef ?? null,
          },
          select: { id: true, assignedTo: { select: { id: true, fullName: true } } },
        });
        return { leadId: lead.id, assignedTo: lead.assignedTo, autoAssigned: Boolean(auto) };
      });
    } catch (error) {
      // Same submission arriving twice at once: the unique externalRef stops the second
      // (and its rotation pick is rolled back with it).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const again = await this.findDuplicate(input.phone, input.externalRef);
        if (again) return { status: 'duplicate', reason: again.reason, leadId: again.lead.id, existingName: again.lead.name };
      }
      throw error;
    }
    return { status: 'created', ...created };
  }

  /** Owner for leads that arrive with no user behind them (API, Meta): the first active admin. */
  async systemOwnerId(): Promise<string> {
    const admin = await this.prisma.user.findFirst({
      where: { isActive: true, role: { key: 'admin' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) throw new Error('No active admin user to own incoming leads');
    return admin.id;
  }
}
