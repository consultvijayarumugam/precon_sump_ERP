"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Badge, buttonSmClass, ErrorText, inputClass, panelClass } from "@/components/ui";
import { api, apiPatch, apiPost, apiPut } from "@/lib/api";
import { NOT_KNOWN, useConstructionStages, type ConstructionStage } from "@/lib/construction";
import { useAction } from "@/lib/use-api";

const iconButton =
  "inline-flex size-8 items-center justify-center rounded-md border border-[var(--ps-line)] bg-[var(--ps-card)] text-[var(--ps-ink-2)] hover:border-[var(--ps-blue-600)] hover:text-[var(--ps-blue-600)] disabled:opacity-40";

function Row({
  stage,
  first,
  last,
  busy,
  onRename,
  onMove,
  onToggle,
  onDelete,
}: {
  stage: ConstructionStage;
  first: boolean;
  last: boolean;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  onMove: (dir: -1 | 1) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (await onRename(name.trim())) setEditing(false);
            }}
          >
            <input className={`${inputClass} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus aria-label="Construction stage name" />
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
            {!stage.isActive && <Badge tone="neutral">Switched off</Badge>}
          </div>
        )}
        <p className="mt-0.5 text-xs text-[var(--ps-ink-3)]">
          {stage.leads ?? 0} lead{stage.leads === 1 ? "" : "s"}
        </p>
      </div>
      {!editing && (
        <div className="flex items-center gap-1.5">
          <button type="button" className={iconButton} aria-label={`Rename ${stage.name}`} title="Rename" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil className="size-4" aria-hidden />
          </button>
          <button type="button" className={iconButton} aria-label={`Move ${stage.name} up`} title="Move up" onClick={() => onMove(-1)} disabled={busy || first}>
            <ArrowUp className="size-4" aria-hidden />
          </button>
          <button type="button" className={iconButton} aria-label={`Move ${stage.name} down`} title="Move down" onClick={() => onMove(1)} disabled={busy || last}>
            <ArrowDown className="size-4" aria-hidden />
          </button>
          <label className="ml-1 flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={stage.isActive} onChange={onToggle} disabled={busy} />
            Active
          </label>
          <button type="button" className={`${iconButton} hover:border-red-400 hover:text-red-600`} aria-label={`Delete ${stage.name}`} title="Delete" onClick={onDelete} disabled={busy}>
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Admin: the construction stages (where the customer's building is). Separate from the
 * lead statuses above; changes show in the web and the app at once (fetched live).
 */
export function ConstructionStagesAdmin() {
  const { data, error, reload } = useConstructionStages();
  const [newName, setNewName] = useState("");
  const [after, setAfter] = useState("");
  const action = useAction();
  const stages = data?.stages ?? [];

  async function run(fn: () => Promise<unknown>) {
    const ok = await action.run(fn);
    reload();
    return ok;
  }

  function move(i: number, dir: -1 | 1) {
    const ids = stages.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run(() => apiPut("/construction-stages/order", { ids }));
  }

  function toggle(stage: ConstructionStage) {
    if (stage.isActive && !window.confirm(`Switch off "${stage.name}"? It leaves the picker; ${stage.leads ? `its ${stage.leads} lead(s) keep it` : "it has no leads"} and nothing is deleted.`)) return;
    void run(() => apiPatch(`/construction-stages/${stage.id}`, { isActive: !stage.isActive }));
  }

  function remove(stage: ConstructionStage) {
    if ((stage.leads ?? 0) > 0) {
      if (stage.isActive && window.confirm(`"${stage.name}" has ${stage.leads} lead(s), so it can't be deleted.\n\nSwitch it off instead? It leaves the picker; its leads keep it.`)) {
        void run(() => apiPatch(`/construction-stages/${stage.id}`, { isActive: false }));
      }
      return;
    }
    if (window.confirm(`Delete "${stage.name}"? No lead has it. This can't be undone (past history keeps its name).`)) {
      void run(() => api(`/construction-stages/${stage.id}`, { method: "DELETE" }));
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => apiPost("/construction-stages", { name: newName.trim(), afterId: after || undefined }))) setNewName("");
  }

  return (
    <section className="space-y-3" aria-labelledby="construction-heading">
      <div>
        <h2 id="construction-heading" className="text-lg font-bold tracking-tight">
          Construction stages
        </h2>
        <p className="text-sm text-[var(--ps-ink-2)]">
          Where the customer&apos;s building is. A second label on each lead, separate from its lead status (a lead can be Quote Shared and at
          Foundation). Changing it never changes who has the lead.
        </p>
      </div>
      <ErrorText error={error ?? action.error} />
      <ol className={`${panelClass} divide-y divide-[var(--ps-line)] overflow-hidden`}>
        <li className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <span className="font-semibold text-[var(--ps-ink)]">{NOT_KNOWN}</span>
            <p className="mt-0.5 text-xs text-[var(--ps-ink-3)]">
              {data?.notKnown.leads ?? 0} lead{data?.notKnown.leads === 1 ? "" : "s"} · the default for every new lead; always first
            </p>
          </div>
        </li>
        {stages.map((s, i) => (
          <Row
            key={s.id}
            stage={s}
            first={i === 0}
            last={i === stages.length - 1}
            busy={action.busy}
            onRename={(name) => run(() => apiPatch(`/construction-stages/${s.id}`, { name }))}
            onMove={(dir) => move(i, dir)}
            onToggle={() => toggle(s)}
            onDelete={() => remove(s)}
          />
        ))}
      </ol>
      <form onSubmit={add} className={`${panelClass} flex flex-wrap items-end gap-3 p-4`}>
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1.5 block font-medium text-[var(--ps-ink-2)]">New construction stage</span>
          <input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Lintel" maxLength={40} />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-[var(--ps-ink-2)]">Place it after</span>
          <select className={inputClass} value={after} onChange={(e) => setAfter(e.target.value)}>
            <option value="">The last one</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonSmClass} disabled={action.busy || newName.trim().length < 2}>
          <Plus className="size-4" aria-hidden /> Add construction stage
        </button>
      </form>
    </section>
  );
}
