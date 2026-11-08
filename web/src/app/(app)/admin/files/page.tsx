"use client";

import { Check, Copy, ExternalLink, FileText, Image as ImageIcon, Pencil, Trash2, Upload, X } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Badge, buttonSmClass, ErrorText, Field, inputClass, NoAccess, PageHeader, panelClass } from "@/components/ui";
import { api, apiPatch, apiUpload } from "@/lib/api";
import { formatDate } from "@/lib/crm";
import { ACCEPT, FILE_CATEGORIES, FileCategory, fileTypeLabel, formatBytes, LibraryFile, MAX_FILE_MB, uploadProblem } from "@/lib/files";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

const iconButton =
  "grid size-8 place-items-center rounded-lg border border-[var(--ps-line)] text-[var(--ps-ink-2)] hover:border-[var(--ps-blue-600)] hover:text-[var(--ps-ink)] disabled:cursor-not-allowed disabled:opacity-30";

function FileRow({ file, busy, onSave, onDelete }: { file: LibraryFile; busy: boolean; onSave: (title: string, category: FileCategory) => Promise<boolean>; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(file.title);
  const [category, setCategory] = useState<FileCategory>(file.category);
  const [copied, setCopied] = useState(false);
  const Icon = file.kind === "pdf" ? FileText : ImageIcon;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${file.kind === "pdf" ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300" : "bg-[var(--ps-tint-50)] text-[var(--ps-blue-600)]"}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-[14rem] flex-1">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (await onSave(title.trim(), category)) setEditing(false);
            }}
          >
            <input className={`${inputClass} max-w-xs`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus aria-label="File title" />
            <select className={`${inputClass} w-auto`} value={category} onChange={(e) => setCategory(e.target.value as FileCategory)} aria-label="Category">
              {FILE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <button type="submit" className={iconButton} aria-label="Save" disabled={busy || title.trim().length < 2}>
              <Check className="size-4" aria-hidden />
            </button>
            <button type="button" className={iconButton} aria-label="Cancel" onClick={() => { setTitle(file.title); setCategory(file.category); setEditing(false); }}>
              <X className="size-4" aria-hidden />
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--ps-ink)]">{file.title}</span>
            <Badge tone="blue">{file.categoryLabel}</Badge>
          </div>
        )}
        <p className="mt-0.5 text-xs text-[var(--ps-ink-3)]">
          {fileTypeLabel(file)} · {formatBytes(file.sizeBytes)} · {file.originalName} · added {formatDate(file.createdAt)}
          {file.uploadedBy && ` by ${file.uploadedBy.fullName}`}
        </p>
      </div>
      {!editing && (
        <div className="flex items-center gap-1.5">
          <a href={file.url} target="_blank" rel="noreferrer" className={iconButton} aria-label={`Open ${file.title}`} title="Open the public link">
            <ExternalLink className="size-4" aria-hidden />
          </a>
          <button
            type="button"
            className={iconButton}
            aria-label={`Copy link to ${file.title}`}
            title={copied ? "Copied" : "Copy link"}
            onClick={async () => {
              await navigator.clipboard?.writeText(file.url).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </button>
          <button type="button" className={iconButton} aria-label={`Rename ${file.title}`} title="Rename / change category" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil className="size-4" aria-hidden />
          </button>
          <button type="button" className={`${iconButton} hover:border-red-400 hover:text-red-600`} aria-label={`Delete ${file.title}`} title="Delete" onClick={onDelete} disabled={busy}>
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}

/** Admin → Files: the brochures and images staff can add to WhatsApp messages as links. */
export default function FilesPage() {
  const { can } = useAuth();
  const allowed = can(TAGS.FILES_MANAGE);
  const { data, error, reload } = useApi<LibraryFile[]>(allowed ? "/files" : null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<FileCategory>("BROCHURE");
  const [pickError, setPickError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const action = useAction();
  if (!allowed) return <NoAccess tag={TAGS.FILES_MANAGE} />;

  const run = async (fn: () => Promise<unknown>) => {
    const ok = await action.run(fn);
    if (ok) reload();
    return ok;
  };

  function choose(f: File | null) {
    setPickError(f ? uploadProblem(f) : null);
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 80));
    if (f && f.type.startsWith("image/") && category === "BROCHURE") setCategory("PRODUCT_IMAGE");
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file || pickError) return;
    if (await run(() => apiUpload("/files", file, { title: title.trim(), category }))) {
      setFile(null);
      setTitle("");
      setCategory("BROCHURE");
      if (input.current) input.current.value = "";
    }
  }

  function remove(f: LibraryFile) {
    if (
      window.confirm(
        `Delete "${f.title}"?\n\nIts link stops working, including in WhatsApp messages already sent to customers. Lead history keeps the file's name. This can't be undone.`,
      )
    ) {
      void run(() => api(`/files/${f.id}`, { method: "DELETE" }));
    }
  }

  const files = data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Files"
        subtitle="Brochures, price lists and product images staff can add to WhatsApp messages. They go out as links: anyone with a link can open that file, without logging in."
      />
      <ErrorText error={error ?? action.error} />

      <form onSubmit={upload} className={`${panelClass} grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end`}>
        <Field label={`File (PDF, JPG or PNG, up to ${MAX_FILE_MB} MB)`}>
          <input ref={input} type="file" accept={ACCEPT} className={`${inputClass} py-1.5`} onChange={(e) => choose(e.target.files?.[0] ?? null)} aria-label="File to upload" />
        </Field>
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Sump brochure 2026" />
        </Field>
        <Field label="Category">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as FileCategory)}>
            {FILE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className={buttonSmClass} disabled={action.busy || !file || Boolean(pickError) || title.trim().length < 2}>
          <Upload className="size-4" aria-hidden /> {action.busy ? "Uploading…" : "Upload"}
        </button>
        {pickError && <p className="text-sm font-medium text-red-600 sm:col-span-4">{pickError}</p>}
      </form>

      <section className={`${panelClass} overflow-hidden`}>
        {data && files.length === 0 && <p className="p-6 text-center text-sm text-[var(--ps-ink-3)]">No files yet. Upload a brochure or product photo above.</p>}
        {!data && !error && <p className="p-6 text-center text-sm text-[var(--ps-ink-3)]">Loading…</p>}
        <ul className="divide-y divide-[var(--ps-line)]">
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              busy={action.busy}
              onSave={(t, c) => run(() => apiPatch(`/files/${f.id}`, { title: t, category: c }))}
              onDelete={() => remove(f)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
