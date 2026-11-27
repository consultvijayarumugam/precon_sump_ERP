// Which side of the handover each pipeline stage is on, for grouping the
// "Move in pipeline" choices and warning before a move changes who has the lead.
// No runtime imports, so it's testable with node --test (stage-sides.test.ts).
import type { PipelineStage } from "./stages";

/** Stages someone can move a lead into: the active ones, plus the lead's current stage even if switched off. */
const pickable = (stages: PipelineStage[] | null | undefined, currentId?: string | null) =>
  (stages ?? []).filter((s) => s.isActive || s.id === currentId);

/**
 * Which side of the handover a stage is on (mirrors the API's stage-sides.ts):
 * New and the stages before the handover are the telecaller side; the handover
 * stage, everything after it and Won are the sales side; Lost just closes.
 * Only for grouping and warnings: anyone who owns a lead may pick any active stage.
 */
export type StageSide = "telecaller" | "sales" | "closed";

export function stageSide(stage: Pick<PipelineStage, "kind" | "phase">): StageSide {
  if (stage.kind === "LOST") return "closed";
  if (stage.kind === "WON") return "sales";
  if (stage.kind === "ENTRY") return "telecaller";
  return stage.phase === "QUALIFIED" || stage.phase === "QUOTED" ? "sales" : "telecaller";
}

export const SIDE_LABELS: Record<StageSide, string> = {
  telecaller: "Telecaller side",
  sales: "Sales side (after handover)",
  closed: "Close",
};

/** The pickable stages in pipeline order, grouped by side (empty groups left out). */
export function groupedStages(stages: PipelineStage[] | null | undefined, currentId?: string | null) {
  const usable = pickable(stages, currentId);
  return (["telecaller", "sales", "closed"] as StageSide[])
    .map((side) => ({ side, label: SIDE_LABELS[side], stages: usable.filter((s) => stageSide(s) === side) }))
    .filter((g) => g.stages.length > 0);
}

/**
 * What a move will probably do to who has the lead, for a warning before it
 * happens (the server decides for certain): "handover" into the sales side
 * from a telecaller, "return" back before the handover for a handed-over lead.
 */
export function moveEffect(target: Pick<PipelineStage, "kind" | "phase">, lead: { ownerIsSales: boolean; handedOver: boolean }): "handover" | "return" | "none" {
  const side = stageSide(target);
  if (side === "sales" && !lead.ownerIsSales) return "handover";
  if (side === "telecaller" && lead.ownerIsSales && lead.handedOver) return "return";
  return "none";
}
