// Construction stages (GET /construction-stages): where the customer's building is
// (Planning, Foundation, ...). A second label on a lead, independent of its lead status,
// fetched live so stages the admin adds or renames show without an app update.
// "Not known" isn't a stage: it's a lead with no construction stage, always first.

export interface ConstructionStage {
  id: string;
  key: string;
  name: string;
  position: number;
  isActive: boolean;
  leads?: number;
}

export interface ConstructionList {
  notKnown: { name: string; leads: number };
  stages: ConstructionStage[];
}

/** A lead's construction stage as the API sends it; null = Not known. */
export type ConstructionRef = { id: string; name: string; isActive?: boolean } | null;

/** Open leads per construction stage, as the dashboards send it. */
export interface ConstructionBreakdown {
  notKnown: { name: string; leads: number };
  stages: { id: string; name: string; isActive: boolean; leads: number }[];
}

export const NOT_KNOWN = 'Not known';

export const constructionLabel = (stage: ConstructionRef | undefined) => stage?.name ?? NOT_KNOWN;

/**
 * The choices in the construction sheet, in admin order: Not known first, then the
 * switched-on stages, plus the lead's current one even if it was switched off.
 */
export function constructionChoices(stages: ConstructionStage[], currentId: string | null): { id: string | null; name: string; isActive: boolean }[] {
  return [{ id: null, name: NOT_KNOWN, isActive: true }, ...stages.filter((s) => s.isActive || s.id === currentId).map((s) => ({ id: s.id, name: s.name, isActive: s.isActive }))];
}

/** "Foundation · 3" rows for the compact breakdown (Not known first; empty switched-off stages hidden). */
export function breakdownRows(b: ConstructionBreakdown | null | undefined): { key: string; label: string; count: number }[] {
  if (!b) return [];
  return [
    { key: 'none', label: b.notKnown.name, count: b.notKnown.leads },
    ...b.stages.filter((s) => s.isActive || s.leads > 0).map((s) => ({ key: s.id, label: s.name, count: s.leads })),
  ];
}
