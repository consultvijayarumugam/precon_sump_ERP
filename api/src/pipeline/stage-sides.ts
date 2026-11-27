/**
 * Which side of the handover a pipeline stage is on, and what a move does to
 * who owns the lead. Ownership always follows the stage:
 *
 *   telecaller side  New, and the stages before the handover (phase NEW / CONTACTED)
 *   sales side       the handover stage and everything after it, and Won
 *   closed           Lost: ends the lead, whoever has it keeps it
 *
 * Anyone who owns the lead may move it to any active stage; crossing the
 * handover hands it over (or back) so it's never in a sales stage while
 * sitting in a telecaller's worklist.
 */
import type { LeadStatus, StageKind } from '../generated/prisma/client.js';

export type StageSide = 'telecaller' | 'sales' | 'closed';

export function stageSide(stage: { kind: StageKind | string; phase: LeadStatus | string }): StageSide {
  if (stage.kind === 'LOST') return 'closed';
  if (stage.kind === 'WON') return 'sales';
  if (stage.kind === 'ENTRY') return 'telecaller';
  return stage.phase === 'QUALIFIED' || stage.phase === 'QUOTED' ? 'sales' : 'telecaller';
}

export type OwnershipMove = 'handover' | 'return' | 'none';

/**
 * What moving to `target` does to ownership:
 *  - handover: into the sales side while the owner isn't a salesperson (a telecaller, or nobody)
 *  - return:   back to the telecaller side, for a lead that was handed to a salesperson
 *  - none:     everything else (moves within a side, closing as Lost, a salesperson's own walk-in lead)
 */
export function ownershipMove(input: {
  target: StageSide;
  ownerIsSales: boolean;
  /** Was handed over at some point (qualifiedAt set). */
  handedOver: boolean;
}): OwnershipMove {
  if (input.target === 'sales' && !input.ownerIsSales) return 'handover';
  if (input.target === 'telecaller' && input.ownerIsSales && input.handedOver) return 'return';
  return 'none';
}
