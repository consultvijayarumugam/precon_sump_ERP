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
 * Stages offered in "Move stage": every active stage, in the admin's order, for
 * everyone who can move the lead (telecaller, sales or admin). The sides below
 * are only for grouping; crossing the handover changes who has the lead, which
 * the server does (a telecaller moving to Quote Shared hands the lead to sales).
 * A switched-off stage is listed only if the lead is in it.
 */
export function stageChoices(stages: PipelineStage[], _role: StageRole, currentId: string | null): PipelineStage[] {
  return stages.filter((s) => s.isActive || s.id === currentId);
}

/** Which side of the handover a stage is on (mirrors the API): New and before; the handover, after it and Won; Lost. */
export type StageSide = 'telecaller' | 'sales' | 'closed';

export function stageSide(stage: Pick<PipelineStage, 'kind' | 'phase'>): StageSide {
  if (stage.kind === 'LOST') return 'closed';
  if (stage.kind === 'WON') return 'sales';
  if (stage.kind === 'ENTRY') return 'telecaller';
  return stage.phase === 'QUALIFIED' || stage.phase === 'QUOTED' ? 'sales' : 'telecaller';
}

export const SIDE_LABELS: Record<StageSide, string> = { telecaller: 'Telecaller side', sales: 'Sales side (after handover)', closed: 'Close' };

/** The choices grouped by side, in pipeline order (empty groups left out). */
export function groupedChoices(choices: PipelineStage[]): { side: StageSide; label: string; stages: PipelineStage[] }[] {
  return (['telecaller', 'sales', 'closed'] as StageSide[])
    .map((side) => ({ side, label: SIDE_LABELS[side], stages: choices.filter((s) => stageSide(s) === side) }))
    .filter((g) => g.stages.length > 0);
}

/**
 * What a move will probably do to who has the lead, shown before saving (the
 * server decides for certain): "handover" into the sales side from a
 * telecaller; "return" back before the handover for a lead handed to sales.
 */
export function moveEffect(target: Pick<PipelineStage, 'kind' | 'phase'>, lead: { ownerIsSales: boolean; handedOver: boolean }): 'handover' | 'return' | 'none' {
  const side = stageSide(target);
  if (side === 'sales' && !lead.ownerIsSales) return 'handover';
  if (side === 'telecaller' && lead.ownerIsSales && lead.handedOver) return 'return';
  return 'none';
}

/** Only the lead's current owner (or an admin) moves its stage; the server checks this too. */
export function canMoveStage(role: StageRole, userId: string, lead: { assignedTo: { id: string } | null }): boolean {
  return role === 'admin' || lead.assignedTo?.id === userId;
}

/** The lead list's stage chips: every active stage in pipeline order (Won and Lost included). */
export const stageFilters = (stages: PipelineStage[]) => stages.filter((s) => s.isActive);

/** Won and Lost leads are filtered by the day they closed; the rest by the day they were added. */
export const closedKind = (stage: Pick<PipelineStage, 'kind'> | null | undefined): 'WON' | 'LOST' | undefined =>
  stage?.kind === 'WON' ? 'WON' : stage?.kind === 'LOST' ? 'LOST' : undefined;
