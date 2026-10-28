"use client";

import { MessageCircle, Plus } from "lucide-react";
import { FormEvent, useState } from "react";
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

function TemplateForm({
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial?: Partial<MessageTemplate>;
  onSave: (v: { name: string; body: string; sortOrder: number; isActive: boolean }) => Promise<unknown>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const save = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    await save.run(() => onSave({ name, body, sortOrder: Number(sortOrder) || 0, isActive }));
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} placeholder="e.g. Intro message" />
        </Field>
        <Field label="Order">
          <input className={inputClass} type="number" min={0} max={999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
      </div>
      <Field label="Message">
        <textarea className={inputClass} rows={4} value={body} onChange={(e) => setBody(e.target.value)} required minLength={5} maxLength={1500} />
      </Field>
      {body && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
          <span className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Preview (sample lead)</span>
          {preview(body)}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Show it in the WhatsApp picker
      </label>
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
  const { data, error, reload } = useApi<MessageTemplate[]>("/message-templates?all=true");
  const placeholders = useApi<{ key: string; description: string }[]>("/message-templates/placeholders");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const remove = useAction();
  if (!can(TAGS.TEMPLATES_MANAGE)) return <NoAccess tag={TAGS.TEMPLATES_MANAGE} />;

  async function del(t: MessageTemplate) {
    if (!window.confirm(`Delete "${t.name}"? Messages already sent keep its name.`)) return;
    if (await remove.run(() => api(`/message-templates/${t.id}`, { method: "DELETE" }))) reload();
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
          {data?.map((t) => (
            <section key={t.id} className={`${panelClass} p-4 ${t.isActive ? "" : "opacity-70"}`}>
              {editing === t.id ? (
                <TemplateForm
                  initial={t}
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
