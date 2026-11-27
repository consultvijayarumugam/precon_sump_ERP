// Construction stages (GET /construction-stages): where the customer's building is
// (Planning, Foundation, ...). A second label on a lead, independent of its lead status.
// "Not known" isn't a stage: it's a lead with no construction stage, always first.
import type { ConstructionStage } from "@/lib/construction-labels";
import { useApi } from "@/lib/use-api";

export { NOT_KNOWN, constructionLabel, pickableConstruction } from "@/lib/construction-labels";
export type { ConstructionStage, ConstructionRef } from "@/lib/construction-labels";

export interface ConstructionList {
  notKnown: { name: string; leads: number };
  stages: ConstructionStage[];
}

/** The construction stages in admin order (switched-off ones too), fetched live. */
export function useConstructionStages(enabled = true) {
  return useApi<ConstructionList>(enabled ? "/construction-stages" : null);
}

/** Open leads per construction stage, as the dashboards send it. */
export interface ConstructionBreakdown {
  notKnown: { name: string; leads: number };
  stages: (Pick<ConstructionStage, "id" | "name" | "isActive"> & { leads: number })[];
}
