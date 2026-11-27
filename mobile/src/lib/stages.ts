// Pipeline stages in the app always come live from GET /pipeline-stages, so a
// stage the admin adds, renames, reorders or switches off on the web shows up
// here at once, without a new app build. These rules only decide which of
// them each person is offered.
import type { PipelineStage } from './sales.ts';

export type StageRole = 'admin' | 'sales' | 'telecaller';

/** Who's moving the lead, from their tags (not role names). */
export function stageRole(can: (tag: string) => boolean): StageRole {
  if (can('leads.read_all')) return 'admin';
  if (can('leads.receive_qualified')) return 'sales';
  return 'telecaller';
}

/**
 * Stages offered in "Move stage": every active stage, in the admin's order, as one
 * flat list, for whoever owns the lead (telecaller, sales or admin). The stage is
 * only where the conversation is: it never changes who has the lead (handing over
 * to sales is the separate "Qualify & hand over" button).
 * A switched-off stage is listed only if the lead is in it.
 */
export function stageChoices(stages: PipelineStage[], _role: StageRole, currentId: string | null): PipelineStage[] {
  return stages.filter((s) => s.isActive || s.id === currentId);
}

/** Only the lead's current owner (or an admin) changes its stage; the server checks this too. */
export function canMoveStage(role: StageRole, userId: string, lead: { assignedTo: { id: string } | null }): boolean {
  return role === 'admin' || lead.assignedTo?.id === userId;
}

/** The lead list's stage chips: every active stage in pipeline order (Won and Lost included). */
export const stageFilters = (stages: PipelineStage[]) => stages.filter((s) => s.isActive);

/** Won and Lost leads are filtered by the day they closed; the rest by the day they were added. */
export const closedKind = (stage: Pick<PipelineStage, 'kind'> | null | undefined): 'WON' | 'LOST' | undefined =>
  stage?.kind === 'WON' ? 'WON' : stage?.kind === 'LOST' ? 'LOST' : undefined;
