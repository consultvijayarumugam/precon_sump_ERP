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
 * Stages offered in "Move stage", in the admin's order:
 *  - admin: every active stage (as on the web lead page);
 *  - sales: the stages after the handover, Won and Lost;
 *  - telecaller: New and the stages before the handover, and Lost
 *    (handing to sales is the Qualify button, which also picks the salesperson).
 * A switched-off stage is listed only if the lead is in it.
 */
export function stageChoices(stages: PipelineStage[], role: StageRole, currentId: string | null): PipelineStage[] {
  const usable = (s: PipelineStage) => s.isActive || s.id === currentId;
  if (role === 'admin') return stages.filter(usable);
  if (role === 'sales') return stages.filter((s) => usable(s) && (s.kind === 'WON' || s.kind === 'LOST' || (s.kind === 'MIDDLE' && (s.phase === 'QUALIFIED' || s.phase === 'QUOTED'))));
  return stages.filter((s) => usable(s) && (s.kind === 'ENTRY' || s.kind === 'LOST' || (s.kind === 'MIDDLE' && (s.phase === 'NEW' || s.phase === 'CONTACTED'))));
}

/** The lead list's stage chips: every active stage in pipeline order (Won and Lost included). */
export const stageFilters = (stages: PipelineStage[]) => stages.filter((s) => s.isActive);

/** Won and Lost leads are filtered by the day they closed; the rest by the day they were added. */
export const closedKind = (stage: Pick<PipelineStage, 'kind'> | null | undefined): 'WON' | 'LOST' | undefined =>
  stage?.kind === 'WON' ? 'WON' : stage?.kind === 'LOST' ? 'LOST' : undefined;
