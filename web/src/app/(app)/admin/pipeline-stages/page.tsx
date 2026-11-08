"use client";

import { ArrowDown, ArrowUp, Check, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Badge,
  buttonSmClass,
  ErrorText,
  inputClass,
  NoAccess,
  PageHeader,
  panelClass,
  secondaryButtonSmClass,
} from "@/components/ui";
import { api, apiPatch, apiPost, apiPut } from "@/lib/api";
import { PipelineStage, useStages } from "@/lib/stages";
import { TAGS } from "@/lib/tags";
import { useAction } from "@/lib/use-api";

const SIDE: Record<string, string> = {
  CONTACTED: "Telecaller side",
  QUALIFIED: "Handover to sales",
  QUOTED: "Sales side",
};

const iconButton =
  "grid size-8 place-items-center rounded-lg border border-[var(--ps-line)] text-[var(--ps-ink-2)] hover:border-[var(--ps-blue-600)] hover:text-[var(--ps-ink)] disabled:cursor-not-allowed disabled:opacity-30";

function StageRow({
  stage,
  index,
  middleCount,
  busy,
  onRename,
  onMove,
  onToggle,
  onDelete,
}: {
  stage: PipelineStage;
  index: number; // position among the middle stages (-1 for protected)
  middleCount: number;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  onMove: (dir: -1 | 1) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const protectedStage = stage.kind !== "MIDDLE";

  return (
    <li className={`flex flex-wrap items-center gap-3 px-4 py-3 ${stage.isActive ? "" : "bg-[var(--ps-tint-50)]/40 opacity-70"}`}>
      <span className="w-6 text-right text-sm font-semibold tabular-nums text-[var(--ps-ink-3)]">{index >= 0 ? index + 2 : stage.kind === "ENTRY" ? 1 : ""}</span>
      <div className="min-w-[12rem] flex-1">
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (await onRename(name.trim())) setEditing(false);
            }}
          >
            <input className={`${inputClass} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus aria-label="Stage name" />
            <button type="submit" className={iconButton} aria-label="Save name" disabled={busy || name.trim().length < 2}>
              <Check className="size-4" aria-hidden />
            </button>
            <button type="button" className={iconButton} aria-label="Cancel" onClick={() => { setName(stage.name); setEditing(false); }}>
              <X className="size-4" aria-hidden />
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--ps-ink)]">{stage.name}</span>
            {protectedStage && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Lock className="size-3" aria-hidden /> Protected
              </span>
            )}
            {stage.isHandover && <Badge tone="green">Handover: telecallers qualify into this</Badge>}
            {stage.kind === "MIDDLE" && !stage.isHandover && <span className="text-xs text-[var(--ps-ink-3)]">{SIDE[stage.phase]}</span>}
            {!stage.isActive && <Badge tone="neutral">Switched off</Badge>}
          </div>
        )}
        <p className="mt-0.5 text-xs text-[var(--ps-ink-3)]">
          {stage.leads ?? 0} lead{stage.leads === 1 ? "" : "s"}
          {stage.kind === "ENTRY" && " · always the first stage"}
          {stage.kind === "WON" && " · drives revenue and the Won list"}
          {stage.kind === "LOST" && " · ends the lead"}
        </p>
      </div>
      {!protectedStage && !editing && (
        <div className="flex items-center gap-1.5">
          <button type="button" className={iconButton} aria-label={`Rename ${stage.name}`} title="Rename" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil className="size-4" aria-hidden />
          </button>
          <button type="button" className={iconButton} aria-label={`Move ${stage.name} up`} title="Move up" onClick={() => onMove(-1)} disabled={busy || index === 0}>
            <ArrowUp className="size-4" aria-hidden />
          </button>
          <button type="button" className={iconButton} aria-label={`Move ${stage.name} down`} title="Move down" onClick={() => onMove(1)} disabled={busy || index === middleCount - 1}>
            <ArrowDown className="size-4" aria-hidden />
          </button>
          <label className={`ml-1 flex items-center gap-1.5 text-xs ${stage.isHandover ? "opacity-50" : ""}`} title={stage.isHandover ? "The handover stage is always on" : undefined}>
            <input type="checkbox" checked={stage.isActive} onChange={onToggle} disabled={busy || stage.isHandover} />
            Active
          </label>
          <button
            type="button"
            className={`${iconButton} hover:border-red-400 hover:text-red-600`}
            aria-label={`Delete ${stage.name}`}
            title={stage.isHandover ? "The handover stage can't be deleted" : "Delete"}
            onClick={onDelete}
            disabled={busy || stage.isHandover}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}

/** Admin → Pipeline stages: the middle of the pipeline is yours to shape; New, Won and Lost stay put. */
export default function PipelineStagesPage() {
  const { can } = useAuth();
  const allowed = can(TAGS.PIPELINE_MANAGE);
  const { data, error, reload } = useStages(allowed);
  const [newName, setNewName] = useState("");
  const [after, setAfter] = useState("");
  const action = useAction();
  if (!allowed) return <NoAccess tag={TAGS.PIPELINE_MANAGE} />;

  const stages = data ?? [];
  const middle = stages.filter((s) => s.kind === "MIDDLE");
  const entry = stages.find((s) => s.kind === "ENTRY");
  const outcomes = stages.filter((s) => s.kind === "WON" || s.kind === "LOST");
  const handoverAt = middle.findIndex((s) => s.isHandover);

  const run = async (fn: () => Promise<unknown>) => {
    const ok = await action.run(fn);
    if (ok) reload();
    return ok;
  };

  function move(i: number, dir: -1 | 1) {
    const order = middle.map((s) => s.id);
    const j = i + dir;
    [order[i], order[j]] = [order[j], order[i]];
    // Crossing the handover stage changes which side of the handover a stage is on.
    const stage = middle[i];
    const other = middle[j];
    const crosses = stage.isHandover ? other.leads : other.isHandover ? stage.leads : 0;
    if (other.isHandover || stage.isHandover) {
      const moving = stage.isHandover ? other : stage;
      const toSide = (stage.isHandover ? dir === 1 : dir === -1) ? "telecaller side (before handover)" : "sales side (after handover)";
      if (!window.confirm(`This moves "${moving.name}" to the ${toSide}.${crosses ? ` Its ${crosses} lead(s) move with it and will count as ${toSide.split(" (")[0]}.` : ""}\n\nContinue?`)) return;
    }
    void run(() => apiPut("/pipeline-stages/order", { ids: order }));
  }

  function remove(stage: PipelineStage) {
    if ((stage.leads ?? 0) > 0) {
      const off = stage.isActive
        ? window.confirm(
            `"${stage.name}" has ${stage.leads} lead${stage.leads === 1 ? "" : "s"}, so it can't be deleted.\n\nSwitch it off instead? It disappears from the stage picker for new moves; its leads and their history stay as they are.`,
          )
        : (window.alert(`"${stage.name}" still has ${stage.leads} lead(s), so it can't be deleted. Move them to another stage first.`), false);
      if (off) void run(() => apiPatch(`/pipeline-stages/${stage.id}`, { isActive: false }));
      return;
    }
    if (window.confirm(`Delete "${stage.name}"? It has no leads. This can't be undone (past history keeps its name).`)) {
      void run(() => api(`/pipeline-stages/${stage.id}`, { method: "DELETE" }));
    }
  }

  function toggle(stage: PipelineStage) {
    if (stage.isActive && !window.confirm(`Switch off "${stage.name}"? It disappears from the stage picker; ${stage.leads ? `its ${stage.leads} lead(s) stay in it` : "it has no leads"} and nothing is deleted.`)) return;
    void run(() => apiPatch(`/pipeline-stages/${stage.id}`, { isActive: !stage.isActive }));
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => apiPost("/pipeline-stages", { name: newName.trim(), afterStageId: after || undefined }));
    if (ok) setNewName("");
  }

  const rowProps = { busy: action.busy, middleCount: middle.length };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline stages"
        subtitle="Shape the middle of the pipeline. New, Won and Lost are protected because revenue, the Won list and closing a lead depend on them."
      />
      <ErrorText error={error ?? action.error} />

      <section className={`${panelClass} overflow-hidden`}>
        <ol className="divide-y divide-[var(--ps-line)]">
          {entry && <StageRow stage={entry} index={-1} {...rowProps} onRename={async () => false} onMove={() => {}} onToggle={() => {}} onDelete={() => {}} />}
          {middle.map((s, i) => (
            <StageRow
              key={s.id}
              stage={s}
              index={i}
              {...rowProps}
              onRename={(name) => run(() => apiPatch(`/pipeline-stages/${s.id}`, { name }))}
              onMove={(dir) => move(i, dir)}
              onToggle={() => toggle(s)}
              onDelete={() => remove(s)}
            />
          ))}
          {outcomes.map((s) => (
            <StageRow key={s.id} stage={s} index={-1} {...rowProps} onRename={async () => false} onMove={() => {}} onToggle={() => {}} onDelete={() => {}} />
          ))}
        </ol>
      </section>

      <form onSubmit={add} className={`${panelClass} flex flex-wrap items-end gap-3 p-4`}>
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1.5 block font-medium text-[var(--ps-ink-2)]">New stage name</span>
          <input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Site visit done" maxLength={40} />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-[var(--ps-ink-2)]">Place it after</span>
          <select className={inputClass} value={after} onChange={(e) => setAfter(e.target.value)}>
            <option value="">The last middle stage (before Won)</option>
            {entry && <option value={entry.id}>{entry.name} (first)</option>}
            {middle.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonSmClass} disabled={action.busy || newName.trim().length < 2}>
          <Plus className="size-4" aria-hidden /> Add stage
        </button>
      </form>

      <section className={`${panelClass} space-y-2 p-5 text-sm text-[var(--ps-ink-2)]`}>
        <h2 className="font-semibold text-[var(--ps-ink)]">How stages work</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Stages before <strong>{handoverAt >= 0 ? middle[handoverAt].name : "the handover stage"}</strong> belong to telecallers (their worklist);
            the handover stage and everything after it belong to sales. Moving a stage across the handover moves its leads to the other side.
          </li>
          <li>
            &ldquo;Qualify &amp; hand over&rdquo; always puts leads into the handover stage, by identity: renaming it or moving it is safe.
          </li>
          <li>A lead&apos;s first call moves it from New into the first active telecaller-side stage.</li>
          <li>Switching a stage off hides it from the stage picker; leads already in it stay, with their history. Only an empty stage can be deleted.</li>
          <li>Every stage change on a lead is recorded in its history with the old and new stage names.</li>
        </ul>
        <button type="button" className={`${secondaryButtonSmClass} mt-2`} onClick={() => reload()}>
          Refresh counts
        </button>
      </section>
    </div>
  );
}
