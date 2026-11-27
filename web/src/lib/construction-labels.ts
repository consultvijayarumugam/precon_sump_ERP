// Pure helpers for construction stages (no React), tested in construction-labels.test.ts.

export interface ConstructionStage {
  id: string;
  key: string;
  name: string;
  position: number;
  isActive: boolean;
  leads?: number;
}

/** A lead's construction stage as the API sends it on leads; null = Not known. */
export type ConstructionRef = { id: string; name: string; isActive?: boolean } | null;

export const NOT_KNOWN = "Not known";

/** What to show for a lead's construction stage. */
export const constructionLabel = (stage: ConstructionRef | undefined) => stage?.name ?? NOT_KNOWN;

/** Stages a lead can be put in: the active ones, plus its current one even if switched off. */
export const pickableConstruction = <T extends Pick<ConstructionStage, "id" | "isActive">>(stages: T[] | null | undefined, currentId?: string | null) =>
  (stages ?? []).filter((s) => s.isActive || s.id === currentId);
