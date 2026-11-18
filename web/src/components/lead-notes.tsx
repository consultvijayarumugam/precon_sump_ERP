"use client";

import { MessagesSquare } from "lucide-react";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { buttonSmClass, ErrorText, inputClass, panelClass, secondaryButtonSmClass } from "@/components/ui";
import { apiPatch, apiPost } from "@/lib/api";
import { formatDateTime, LeadDetail, TAGS } from "@/lib/crm";
import { sharedWith, type LeadNote } from "@/lib/notes";
import { useAction, useApi } from "@/lib/use-api";

function NoteItem({ note, mine, leadId, onSaved }: { note: LeadNote; mine: boolean; leadId: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const save = useAction();
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm">
          <span className="font-semibold">{mine ? "You" : note.author.fullName}</span>
          <span className="text-neutral-500"> · {note.author.role.name}</span>
        </span>
        <span className="text-xs text-neutral-500">
          {formatDateTime(note.createdAt)}
          {note.editedAt && <span title={`Edited ${formatDateTime(note.editedAt)}`}> · edited</span>}
        </span>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea className={inputClass} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit note" />
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonSmClass}
              disabled={!text.trim() || save.busy}
              onClick={async () => {
                if (await save.run(() => apiPatch(`/leads/${leadId}/notes/${note.id}`, { body: text }))) {
                  setEditing(false);
                  onSaved();
                }
              }}
            >
              Save
            </button>
            <button
              type="button"
              className={secondaryButtonSmClass}
              onClick={() => {
                setText(note.body);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
          <ErrorText error={save.error} />
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-neutral-200">
          {note.body}
          {mine && (
            <button type="button" onClick={() => setEditing(true)} className="ml-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Edit
            </button>
          )}
        </p>
      )}
    </li>
  );
}

/**
 * The lead's shared notes: the telecaller who worked it, its salesperson and
 * admins all see every note, so they can coordinate. Authors edit their own;
 * the change history keeps every add and edit, and the others are notified.
 */
export function LeadNotes({ lead, refreshKey }: { lead: LeadDetail; refreshKey: string }) {
  const { user, can } = useAuth();
  const notes = useApi<LeadNote[]>(`/leads/${lead.id}/notes?r=${refreshKey}`);
  const [text, setText] = useState("");
  const add = useAction();
  const canWrite = can(TAGS.LEADS_WRITE) || can(TAGS.LEADS_QUALIFY);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await add.run(() => apiPost(`/leads/${lead.id}/notes`, { body: text }))) {
      setText("");
      notes.reload();
    }
  }

  const count = (notes.data?.length ?? 0) + (lead.notes ? 1 : 0);
  return (
    <section className="space-y-3" aria-labelledby="shared-notes">
      <div>
        <h2 id="shared-notes" className="flex items-center gap-2 font-medium">
          <MessagesSquare className="size-4 text-brand-600" aria-hidden />
          Shared notes{count > 0 && <span className="text-neutral-500">· {count}</span>}
        </h2>
        <p className="mt-0.5 text-sm text-neutral-500">{sharedWith(lead)}</p>
      </div>
      <ErrorText error={notes.error} />
      {(lead.notes || (notes.data && notes.data.length > 0)) && (
        <ul className={`${panelClass} divide-y divide-neutral-100 dark:divide-neutral-800`}>
          {lead.notes && (
            <li className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-semibold">Added with the lead</span>
                <span className="text-xs text-neutral-500">{formatDateTime(lead.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-neutral-200">{lead.notes}</p>
            </li>
          )}
          {notes.data?.map((n) => <NoteItem key={n.id} note={n} mine={n.author.id === user.id} leadId={lead.id} onSaved={notes.reload} />)}
        </ul>
      )}
      {notes.data && notes.data.length === 0 && !lead.notes && <p className="text-sm text-neutral-500">No notes yet.</p>}
      {canWrite && (
        <form onSubmit={submit} className={`${panelClass} space-y-2 p-3`}>
          <textarea
            className={inputClass}
            rows={2}
            maxLength={2000}
            placeholder="Write a note for the team, e.g. what the customer said, when to call…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="New shared note"
          />
          <div className="flex items-center justify-between gap-2">
            <ErrorText error={add.error} />
            <button type="submit" className={`${buttonSmClass} ml-auto`} disabled={!text.trim() || add.busy}>
              Add note
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
