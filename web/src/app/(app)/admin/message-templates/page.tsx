"use client";

import { MessageCircle, Plus } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Badge,
  buttonSmClass,
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  PageHeader,
  panelClass,
  secondaryButtonSmClass,
} from "@/components/ui";
import type { MessageTemplate } from "@/components/whatsapp-button";
import { api, apiPatch, apiPost } from "@/lib/api";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

/** What the preview fills in; the real values come from each lead when sending. */
const SAMPLE: Record<string, string> = {
  name: "Ravi Kumar",
  first_name: "Ravi",
  city: "Erode",
  product: "Sump · 10,000 L",
  my_name: "Tara",
  company: "Precon",
};
const preview = (body: string) =>
  body.replace(/\{\s*([a-z_]+)\s*\}/gi, (m, k: string) => SAMPLE[k.toLowerCase()] ?? m).replace(/[ \t]{2,}/g, " ");

type Placeholder = { key: string; description: string };

function TemplateForm({
  initial,
  placeholders,
  lastActive,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial?: Partial<MessageTemplate>;
  placeholders: Placeholder[];
  /** This is the only template switched on: warn before switching it off. */
  lastActive?: boolean;
  onSave: (v: { name: string; body: string; sortOrder: number; isActive: boolean }) => Promise<unknown>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [problems, setProblems] = useState<string[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const save = useAction();

  /** Put a placeholder where the cursor is (or replace the selection), then keep typing after it. */
  function insert(token: string) {
    const el = bodyRef.current;
    const from = el?.selectionStart ?? body.length;
    const to = el?.selectionEnd ?? body.length;
    const before = body.slice(0, from);
    const spacer = before && !/\s$/.test(before) ? " " : "";
    const next = `${before}${spacer}${token}${body.slice(to)}`;
    setBody(next);
    const caret = from + spacer.length + token.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: string[] = [];
    if (name.trim().length < 2) found.push("Give the template a name (at least 2 characters).");
    if (body.trim().length < 5) found.push("Write the message (at least 5 characters).");
    setProblems(found);
    if (found.length) return;
    if (lastActive && !isActive && !window.confirm("This is the only template switched on. Turn it off and telecallers and sales will have no templates to pick. Continue?")) return;
    await save.run(() => onSave({ name: name.trim(), body: body.trim(), sortOrder: Number(sortOrder) || 0, isActive }));
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="Name *">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Site visit confirmation" />
        </Field>
        <Field label="Order in picker">
          <input className={inputClass} type="number" min={0} max={999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
      </div>
      <div className="text-sm">
        <label htmlFor={`body-${initial?.id ?? "new"}`} className="mb-1.5 block font-medium text-neutral-700 dark:text-neutral-300">
          Message *
        </label>
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Insert a placeholder">
          <span className="text-xs text-neutral-500">Insert:</span>
          {placeholders.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.description}
              onClick={() => insert(p.key)}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-medium text-emerald-800 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              {p.key}
            </button>
          ))}
        </div>
        <textarea
          id={`body-${initial?.id ?? "new"}`}
          ref={bodyRef}
          className={inputClass}
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1500}
          placeholder="Hi {first_name}, this is {my_name} from {company}…"
        />
        <span className="mt-1 block text-right text-xs text-neutral-500">{body.length} / 1500</span>
      </div>
      {body.trim() && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
          <span className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Preview (sample lead)</span>
          {preview(body)}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active: show it in the WhatsApp picker
      </label>
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm font-medium text-red-600 dark:text-red-400" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <ErrorText error={save.error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonSmClass} disabled={save.busy}>
          {save.busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={secondaryButtonSmClass} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/** Admin → Message templates: the reusable WhatsApp messages telecallers and sales pick from. */
export default function MessageTemplatesPage() {
  const { can } = useAuth();
  // Only admins (templates.manage) ask for the full list; others just see "no access".
  const { data, error, reload } = useApi<MessageTemplate[]>(can(TAGS.TEMPLATES_MANAGE) ? "/message-templates?all=true" : null);
  const placeholders = useApi<{ key: string; description: string }[]>("/message-templates/placeholders");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const remove = useAction();
  if (!can(TAGS.TEMPLATES_MANAGE)) return <NoAccess tag={TAGS.TEMPLATES_MANAGE} />;

  const activeCount = data?.filter((t) => t.isActive).length ?? 0;
  const isLastActive = (t: MessageTemplate) => t.isActive && activeCount === 1;

  async function del(t: MessageTemplate) {
    const warning =
      data?.length === 1
        ? `"${t.name}" is the last template. After deleting it, telecallers and sales will have no templates to pick (they can still open a blank chat).\n\nDelete it anyway?`
        : isLastActive(t)
          ? `"${t.name}" is the only template switched on. After deleting it, the WhatsApp picker will be empty until you switch another one on.\n\nDelete it anyway?`
          : `Delete "${t.name}"? This can't be undone. Messages already sent keep its name.`;
    if (!window.confirm(warning)) return;
    if (await remove.run(() => api(`/message-templates/${t.id}`, { method: "DELETE" }))) reload();
  }

  async function toggle(t: MessageTemplate) {
    if (isLastActive(t) && !window.confirm(`"${t.name}" is the only template switched on. Turn it off and the WhatsApp picker will be empty. Continue?`)) return;
    if (await remove.run(() => apiPatch(`/message-templates/${t.id}`, { isActive: !t.isActive }))) reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Message templates"
        subtitle="Reusable WhatsApp messages. Telecallers and sales pick one from the WhatsApp button on a lead; placeholders fill in from that lead."
        action={
          !adding && (
            <button type="button" className={buttonSmClass} onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden /> New template
            </button>
          )
        }
      />
      <ErrorText error={error ?? remove.error} />

      {adding && (
        <section className={`${panelClass} p-5`}>
          <h2 className="mb-3 font-semibold">New template</h2>
          <TemplateForm
            placeholders={placeholders.data ?? []}
            submitLabel="Create template"
            onCancel={() => setAdding(false)}
            onSave={async (v) => {
              await apiPost("/message-templates", v);
              setAdding(false);
              reload();
            }}
          />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {data?.length === 0 && <p className="text-sm text-neutral-500">No templates yet. Create one, e.g. an intro message.</p>}
          {data && data.length > 0 && activeCount === 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="status">
              No template is switched on, so the WhatsApp picker shows only &ldquo;Open chat without a message&rdquo;. Switch one on.
            </p>
          )}
          {data?.map((t) => (
            <section key={t.id} className={`${panelClass} p-4 ${t.isActive ? "" : "opacity-70"}`}>
              {editing === t.id ? (
                <TemplateForm
                  initial={t}
                  placeholders={placeholders.data ?? []}
                  lastActive={isLastActive(t)}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSave={async (v) => {
                    await apiPatch(`/message-templates/${t.id}`, v);
                    setEditing(null);
                    reload();
                  }}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-semibold">
                      <MessageCircle className="size-4 text-emerald-600" aria-hidden />
                      {t.name}
                      {t.isActive ? <Badge tone="green">In picker</Badge> : <Badge tone="neutral">Switched off</Badge>}
                    </h2>
                    <div className="flex gap-2">
                      <button type="button" className={secondaryButtonSmClass} onClick={() => toggle(t)} disabled={remove.busy}>
                        {t.isActive ? "Switch off" : "Switch on"}
                      </button>
                      <button type="button" className={secondaryButtonSmClass} onClick={() => setEditing(t.id)}>
                        Edit
                      </button>
                      <button type="button" className={`${secondaryButtonSmClass} text-red-700 dark:text-red-300`} onClick={() => del(t)} disabled={remove.busy}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">{t.body}</p>
                  <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Preview (sample lead)</span>
                    {preview(t.body)}
                  </p>
                </>
              )}
            </section>
          ))}
        </div>
        <aside className={`${panelClass} h-fit p-4 text-sm`}>
          <h2 className="mb-2 font-semibold">Placeholders</h2>
          <ul className="space-y-1.5">
            {placeholders.data?.map((p) => (
              <li key={p.key}>
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">{p.key}</code>{" "}
                <span className="text-neutral-600 dark:text-neutral-400">{p.description}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">
            Indian numbers get the 91 country code automatically. WhatsApp opens with the message typed in; the sender still taps Send.
            Each message started is recorded on the lead.
          </p>
        </aside>
      </div>
    </div>
  );
}
