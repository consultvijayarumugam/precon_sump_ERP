import { BadRequestException, Injectable } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { recordActivity } from '../crm/lead-history.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ownershipMove, stageSide, type OwnershipMove } from '../pipeline/stage-sides.js';
import { LeadAssignmentService, ROTATIONS, type Assignee } from './lead-assignment.service.js';

export interface OwnedLead {
  id: string;
  assignedToId: string | null;
  assignedTo: { fullName: string } | null;
  telecallerId: string | null;
  qualifiedAt: Date | null;
}

export interface OwnershipPlan {
  move: OwnershipMove;
  /** Who can receive it: the sales rotation (handover) or the telecaller to give it back to (return). */
  rotation: string[];
  /** For a return: the telecaller who worked it, if they can take it back. */
  preferredTelecallerId: string | null;
  ownerIsTelecaller: boolean;
}

/**
 * Keeps who owns a lead in step with its pipeline stage when someone moves it
 * by hand (see stage-sides.ts). Planned before the change (so an impossible
 * move is refused with nothing changed), then carried out inside the same
 * transaction as the stage update.
 */
@Injectable()
export class LeadOwnershipService {
  constructor(
    private readonly accessControl: AccessControlService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  async plan(lead: OwnedLead, target: { kind: string; phase: string }): Promise<OwnershipPlan> {
    const ownerTags = lead.assignedToId ? (await this.accessControl.getEffectiveAccess(lead.assignedToId)).permissions : [];
    const ownerIsSales = ownerTags.includes(PERMISSIONS.LEADS_RECEIVE_QUALIFIED);
    const ownerIsTelecaller = ownerTags.includes(PERMISSIONS.LEADS_AUTO_ASSIGN);
    const move = ownershipMove({ target: stageSide(target), ownerIsSales, handedOver: lead.qualifiedAt !== null });

    if (move === 'handover') {
      const rotation = await this.assignment.rotationIds(ROTATIONS.sales);
      if (rotation.length === 0) {
        throw new BadRequestException(
          'Moving to this stage hands the lead to sales, but no salesperson is switched on to receive leads. Ask an admin to switch someone on.',
        );
      }
      return { move, rotation, preferredTelecallerId: null, ownerIsTelecaller };
    }
    if (move === 'return') {
      const members = await this.assignment.members(ROTATIONS.telecallers);
      const enabled = members.filter((m) => m.autoAssignEnabled).map((m) => m.id);
      const preferred = lead.telecallerId && enabled.includes(lead.telecallerId) ? lead.telecallerId : null;
      if (!preferred && enabled.length === 0) {
        throw new BadRequestException(
          'Moving back before the handover returns the lead to a telecaller, but no telecaller is switched on to receive leads. Ask an admin to switch someone on.',
        );
      }
      return { move, rotation: enabled, preferredTelecallerId: preferred, ownerIsTelecaller };
    }
    return { move, rotation: [], preferredTelecallerId: null, ownerIsTelecaller };
  }

  /**
   * Carries out the plan after the stage has been updated in `tx`. Returns who
   * now has the lead (for the notification), or null if nothing changed.
   */
  async apply(
    tx: Prisma.TransactionClient,
    plan: OwnershipPlan,
    lead: OwnedLead,
    actor: AuthenticatedUser,
    stageName: string,
  ): Promise<{ kind: 'handover' | 'return'; to: Assignee; roundRobin: boolean } | null> {
    if (plan.move === 'none') return null;
    const now = new Date();

    if (plan.move === 'handover') {
      const to = await this.assignment.pickNext(tx, plan.rotation);
      if (!to) throw new BadRequestException('No salesperson is switched on to receive leads. Ask an admin to switch someone on.');
      // The telecaller who had it: their open callbacks are done (as when they qualify it).
      await tx.followUp.updateMany({ where: { leadId: lead.id, completedAt: null }, data: { completedAt: now, outcome: 'INTERESTED' } });
      const telecallerId = lead.telecallerId ?? (plan.ownerIsTelecaller ? lead.assignedToId : null);
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          assignedToId: to.id,
          autoAssigned: true,
          qualifiedAt: now,
          // Credit the telecaller who worked it; otherwise whoever moved it.
          qualifiedById: plan.ownerIsTelecaller && lead.assignedToId ? lead.assignedToId : actor.id,
          telecallerId,
        },
      });
      await recordActivity(tx, {
        leadId: lead.id,
        userId: actor.id,
        type: 'HANDED_OVER',
        summary: `Moved to ${stageName}: handed to ${to.fullName} (round-robin)`,
        changes: [{ field: 'assignedTo', label: 'Salesperson', from: lead.assignedTo?.fullName ?? null, to: to.fullName }],
        at: now,
      });
      return { kind: 'handover', to, roundRobin: true };
    }

    // Back before the handover: to the telecaller who worked it, or the next one in turn.
    const preferred = plan.preferredTelecallerId
      ? await tx.user.findUniqueOrThrow({ where: { id: plan.preferredTelecallerId }, select: { id: true, fullName: true } })
      : null;
    const to = preferred ?? (await this.assignment.pickNext(tx, plan.rotation));
    if (!to) throw new BadRequestException('No telecaller is switched on to receive leads. Ask an admin to switch someone on.');
    await tx.lead.update({ where: { id: lead.id }, data: { assignedToId: to.id, autoAssigned: !preferred, telecallerId: to.id } });
    await recordActivity(tx, {
      leadId: lead.id,
      userId: actor.id,
      type: 'ASSIGNED',
      summary: `Moved back to ${stageName}: returned to ${to.fullName}${preferred ? '' : ' (round-robin)'}`,
      changes: [{ field: 'assignedTo', label: 'Assigned to', from: lead.assignedTo?.fullName ?? null, to: to.fullName }],
      at: now,
    });
    return { kind: 'return', to, roundRobin: !preferred };
  }
}
