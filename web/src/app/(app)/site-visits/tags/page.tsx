"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  PageHeader,
  secondaryButtonClass,
  TagChip,
} from "@/components/ui";
import { api, apiPatch, apiPost } from "@/lib/api";
import { SiteVisitTag, TAG_COLORS, TagColor } from "@/lib/service";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

function TagEditor({
  tag,
  onSaved,
  onCancel,
}: {
  tag?: SiteVisitTag;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [description, setDescription] = useState(tag?.description ?? "");
  const [color, setColor] = useState<TagColor>(tag?.color ?? "slate");
  const { run, busy, error } = useAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = { name, description: description || null, color };
    const ok = await run(() => (tag ? apiPatch(`/site-visit-tags/${tag.id}`, body) : apiPost("/site-visit-tags", body)));
    if (ok) {
      if (!tag) {
        setName("");
        setDescription("");
      }
      onSaved();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <Field label="Name">
          <input className={inputClass} required placeholder="e.g. soil-test" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Colour">
          <select className={inputClass} value={color} onChange={(e) => setColor(e.target.value as TagColor)}>
            {TAG_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <TagChip tag={{ name: name || "preview", color, isActive: true }} />
        <button type="submit" className={`${buttonClass} py-1`} disabled={busy}>
          {tag ? "Save" : "Add tag"}
        </button>
        {onCancel && (
          <button type="button" className="text-xs text-neutral-500" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <ErrorText error={error} />
    </form>
  );
}

/** Admin: manage the list of site-visit tags (#18). */
export default function SiteVisitTagsPage() {
  const { can } = useAuth();
  const canManage = can(TAGS.SITEVISIT_MANAGE_TAGS);
  const { data, error, reload } = useApi<SiteVisitTag[]>(canManage ? "/site-visit-tags?includeInactive=true" : null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const action = useAction();
  if (!canManage) return <NoAccess tag={TAGS.SITEVISIT_MANAGE_TAGS} />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/site-visits" className="text-sm text-neutral-500 underline">
          ← Site visits
        </Link>
        <PageHeader title="Site-visit tags" />
        <p className="text-sm text-neutral-500">
          These are the tags people can put on a site visit. Retiring a tag hides it from new visits but keeps it on old ones.
          Only unused tags can be deleted.
        </p>
      </div>

      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 font-medium">Add a tag</h2>
        <TagEditor onSaved={reload} />
      </section>

      <ErrorText error={error ?? action.error} />
      <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
        {data?.map((t) => (
          <li key={t.id} className="py-3">
            {editingId === t.id ? (
              <TagEditor
                tag={t}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  reload();
                }}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <TagChip tag={t} />
                <span className="text-neutral-500">{t.description}</span>
                <span className="text-xs text-neutral-500">
                  {t.visitCount} visit{t.visitCount === 1 ? "" : "s"}
                  {!t.isActive && " · retired"}
                </span>
                <div className="ml-auto flex gap-2">
                  <button className={`${secondaryButtonClass} py-0.5 text-xs`} onClick={() => setEditingId(t.id)}>
                    Edit
                  </button>
                  <button
                    className={`${secondaryButtonClass} py-0.5 text-xs`}
                    disabled={action.busy}
                    onClick={async () => {
                      if (await action.run(() => apiPatch(`/site-visit-tags/${t.id}`, { isActive: !t.isActive }))) reload();
                    }}
                  >
                    {t.isActive ? "Retire" : "Restore"}
                  </button>
                  {t.visitCount === 0 && (
                    <button
                      className="text-xs text-red-600 underline"
                      onClick={async () => {
                        if (!confirm(`Delete tag "${t.name}"?`)) return;
                        if (await action.run(() => api(`/site-visit-tags/${t.id}`, { method: "DELETE" }))) reload();
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
