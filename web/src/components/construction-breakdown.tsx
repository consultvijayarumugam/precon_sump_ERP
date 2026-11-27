"use client";

import { HardHat } from "lucide-react";
import Link from "next/link";
import { panelClass } from "@/components/ui";
import { constructionLabel, type ConstructionBreakdown, type ConstructionRef } from "@/lib/construction";

/** A lead's construction stage as a small badge ("Not known" muted), beside its lead status. */
export function ConstructionBadge({ stage }: { stage: ConstructionRef | undefined }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        stage ? "bg-orange-50 text-orange-800 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300" : "bg-neutral-50 text-neutral-500 ring-neutral-400/20 dark:bg-neutral-900"
      }`}
      title="Construction stage"
    >
      <HardHat className="size-3" aria-hidden />
      {constructionLabel(stage)}
    </span>
  );
}

/**
 * Open leads per construction stage at a glance ("how many at Foundation / Roof"),
 * beside the lead-status pipeline. Each stage opens the Leads list filtered to it.
 */
export function ConstructionBreakdownCard({ data, title = "Construction stage (open leads)" }: { data: ConstructionBreakdown | undefined; title?: string }) {
  if (!data) return null;
  const rows = [{ id: "none", name: data.notKnown.name, leads: data.notKnown.leads, isActive: true }, ...data.stages];
  const known = data.stages.reduce((n, s) => n + s.leads, 0);
  return (
    <section className={`${panelClass} p-4`} aria-labelledby="construction-breakdown">
      <h2 id="construction-breakdown" className="flex items-center gap-2 text-sm font-semibold">
        <HardHat className="size-4 text-orange-600" aria-hidden /> {title}
        <span className="font-normal text-neutral-500">· {known} with a stage</span>
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/leads?constructionStageId=${r.id}`}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:border-orange-400 ${
                r.id === "none" ? "border-dashed border-neutral-300 text-neutral-500 dark:border-neutral-700" : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <span>{r.name}</span>
              <strong className="tabular-nums">{r.leads}</strong>
              {!r.isActive && <span className="text-xs text-neutral-400">(off)</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
