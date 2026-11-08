// Admin-managed pipeline stages (GET /pipeline-stages). `phase` is the fixed
// status a stage counts as; New / Won / Lost are protected; isHandover marks
// where telecallers hand leads to sales.
import type { LeadStatus } from "@/lib/crm";
import { useApi } from "@/lib/use-api";

export type StageKind = "ENTRY" | "MIDDLE" | "WON" | "LOST";

export interface PipelineStage {
  id: string;
  key: string;
  name: string;
  kind: StageKind;
  phase: LeadStatus;
  isHandover: boolean;
  position: number;
  isActive: boolean;
  leads?: number;
}

/** A lead's stage as the API returns it on leads. */
export type StageRef = Pick<PipelineStage, "id" | "name" | "phase"> & Partial<Pick<PipelineStage, "key" | "kind" | "isActive">>;

/** All stages in pipeline order (inactive ones too). */
export function useStages(enabled = true) {
  return useApi<PipelineStage[]>(enabled ? "/pipeline-stages" : null);
}

/** Stages someone can move a lead into: the active ones, plus the lead's current stage even if switched off. */
export const pickableStages = (stages: PipelineStage[] | null | undefined, currentId?: string | null) =>
  (stages ?? []).filter((s) => s.isActive || s.id === currentId);
