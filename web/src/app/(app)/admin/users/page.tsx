"use client";

import { History, UserMinus, UserPlus } from "lucide-react";
import { FormEvent, Fragment, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Badge,
  buttonClass,
  ErrorText,
  Field,
  inputClass,
  NoAccess,
  PageHeader,
  panelClass,
  secondaryButtonClass,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { api, apiPatch, apiPost } from "@/lib/api";
import { formatDateTime } from "@/lib/crm";
import { MODULES, ModuleKey, moduleForTagModule } from "@/lib/modules";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";
import { blockedReason, dataLine, openLeadsLine, shareOutLines, sortAssignees, type RemovalCheck, type UserAuditEvent } from "@/lib/user-removal";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  role: { key: string; name: string };
  customTagCount: number;
}

interface PermissionSummary {
  rolePermissions: string[];
  granted: string[];
  revoked: string[];
  effective: { permissions: string[]; modules: string[] };
}

interface Role {
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
}

interface Permission {
  key: string;
  module: string;
  description: string;
}

/** The four roles, in the order admins usually pick them. Their tag presets live in the API. */
const ROLE_OPTIONS = [
  { key: "sales", name: "Sales" },
  { key: "telecaller", name: "Telecaller" },
  { key: "factory_supervisor", name: "Factory Supervisor" },
  { key: "admin", name: "Admin" },
];

const ROLE_BADGE: Record<string, "violet" | "blue" | "amber" | "neutral"> = {
  sales: "violet",
  telecaller: "blue",
  factory_supervisor: "amber",
  admin: "neutral",
};

/** What a role's preset gives: modules (as coloured chips) and the tags behind them. */
function RolePresetPreview({ roleKey }: { roleKey: string }) {
  const roles = useApi<Role[]>("/roles");
  const catalog = useApi<Permission[]>("/permissions");
  const role = roles.data?.find((r) => r.key === roleKey);
  if (!role || !catalog.data) return null;

  const byModule = new Map<ModuleKey, string[]>();
  for (const tag of role.permissions) {
    const mod = moduleForTagModule(catalog.data.find((p) => p.key === tag)?.module ?? "admin");
    byModule.set(mod, [...(byModule.get(mod) ?? []), tag]);
  }
  const order: ModuleKey[] = ["crm", "finance", "operations", "hr", "admin"];

  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900/60">
      <p className="font-medium">
        {role.name} preset · {role.permissions.length} tags
      </p>
      {role.description && <p className="text-xs text-neutral-500">{role.description}</p>}
      <div className="mt-2 space-y-1.5">
        {order
          .filter((m) => byModule.has(m))
          .map((m) => (
            <div key={m} className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex w-24 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${MODULES[m].text}`}>
                <span className={`size-1.5 rounded-full ${MODULES[m].dot}`} aria-hidden />
                {MODULES[m].label}
              </span>
              {byModule.get(m)!.map((t) => (
                <code key={t} className={`rounded px-1.5 py-0.5 text-[11px] ${MODULES[m].chip}`}>
                  {t}
                </code>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function UserForm({ user, onDone, onCancel }: { user?: UserRow; onDone: () => void; onCancel: () => void }) {
  const { user: me, can } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [roleKey, setRoleKey] = useState(user?.role.key ?? "sales");
  const [password, setPassword] = useState("");
  const { run, busy, error } = useAction();
  const isMe = user?.id === me.id;
  const roleChanging = user && roleKey !== user.role.key;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      user
        ? apiPatch(`/users/${user.id}`, {
            fullName,
            phone: phone || null,
            ...(roleChanging ? { roleKey } : {}),
            ...(password ? { password } : {}),
          })
        : apiPost("/users", { fullName, email, phone: phone || undefined, roleKey, password }),
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={handleSubmit} className={`${panelClass} space-y-4 p-5`}>
      <h2 className="text-[15px] font-semibold">{user ? `Edit ${user.fullName}` : "New user"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name *">
          <input className={inputClass} required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email (sign-in) *">
          <input
            className={inputClass}
            type="email"
            required
            disabled={Boolean(user)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <input className={inputClass} type="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Role *">
          <select className={inputClass} value={roleKey} disabled={isMe} onChange={(e) => setRoleKey(e.target.value)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={user ? "New password (leave blank to keep)" : "Initial password *"}>
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            required={!user}
            minLength={8}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </div>
      {isMe && <p className="text-xs text-neutral-500">You can&apos;t change your own role or remove yourself.</p>}
      {!user && roleKey === "admin" && (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          A new admin gets everything you have: every CRM screen plus Admin (users, tags, stages, templates, files, lead assignment).
        </p>
      )}
      {roleChanging && user!.customTagCount > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Changing the role resets {user!.fullName}&apos;s tags to the new preset. Their {user!.customTagCount} custom tag
          change(s) will be cleared.
        </p>
      )}
      {can(TAGS.PERMISSIONS_READ) && <RolePresetPreview roleKey={roleKey} />}
      <ErrorText error={error} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          {user ? "Save changes" : "Create user"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function UserTags({ userId }: { userId: string }) {
  const { data, error } = useApi<PermissionSummary>(`/users/${userId}/permissions`);
  if (error) return <ErrorText error={error} />;
  if (!data) return <p className="text-xs text-neutral-500">Loading…</p>;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-28 text-neutral-500">Effective tags</span>
        {data.effective.permissions.map((p) => (
          <code key={p} className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
            {p}
          </code>
        ))}
        {data.effective.permissions.length === 0 && <span className="text-neutral-500">none</span>}
      </div>
      {data.granted.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-28 text-neutral-500">Granted extra</span>
          {data.granted.map((p) => (
            <Badge key={p} tone="green">
              + {p}
            </Badge>
          ))}
        </div>
      )}
      {data.revoked.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-28 text-neutral-500">Revoked</span>
          {data.revoked.map((p) => (
            <Badge key={p} tone="red">
              − {p}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Remove a user. Deactivate is the normal path: they can't sign in or get new
 * leads, everything they did stays, and it can be undone. Their open leads
 * must go to someone first. Delete is only offered for an account with no
 * data at all (made by mistake, never used). The last admin can't be removed.
 */
function RemovePanel({ userId, onDone, onCancel }: { userId: string; onDone: (message: string) => void; onCancel: () => void }) {
  const { data: check, error: loadError } = useApi<RemovalCheck>(`/users/${userId}/removal`);
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<"person" | "share">("person");
  const { run, busy, error } = useAction();
  if (loadError) return <div className={`${panelClass} p-5`}><ErrorText error={loadError} /></div>;
  if (!check) return <div className={`${panelClass} p-5 text-sm text-neutral-500`}>Checking their leads and records…</div>;

  const name = check.user.fullName;
  const blocked = blockedReason(check);
  const needsOwner = check.openLeads > 0;
  // An already-inactive user can still hold leads (switched off before this check existed).
  const handOverOnly = !check.user.isActive && needsOwner;
  const canAct = !blocked && (check.canDeactivate || handOverOnly);
  const owners = sortAssignees(check);
  const ownerName = owners.find((o) => o.id === to)?.fullName;
  const sharing = needsOwner && mode === "share";
  const ready = !needsOwner || (sharing ? !check.shareOut.blocked : Boolean(to));

  async function deactivate() {
    const body = !needsOwner ? {} : sharing ? { shareOut: true } : { reassignToId: to };
    let sharedOut: Record<string, number> | null = null;
    const ok = await run(async () => {
      ({ sharedOut } = await apiPost<{ sharedOut: Record<string, number> | null }>(`/users/${userId}/deactivate`, body));
    });
    if (!ok) return;
    const where = sharing
      ? `shared out by round-robin (${Object.entries(sharedOut ?? {}).map(([who, n]) => `${who} ${n}`).join(", ")})`
      : `handed to ${ownerName}`;
    onDone(handOverOnly ? `${check!.openLeads} open leads ${where}.` : `${name} deactivated${needsOwner ? `; ${check!.openLeads} open leads ${where}` : ""}.`);
  }
  async function remove() {
    if (!confirm(`Delete ${name} (${check!.user.email}) permanently? This can't be undone.`)) return;
    const ok = await run(() => api(`/users/${userId}`, { method: "DELETE" }));
    if (ok) onDone(`${name} deleted.`);
  }

  return (
    <div className={`${panelClass} space-y-4 p-5`} data-testid="remove-panel">
      <div>
        <h2 className="text-[15px] font-semibold">Remove {name}</h2>
        <p className="text-sm text-neutral-500">
          {check.user.role.name} · {check.user.email} · {check.user.isActive ? "Active" : "Inactive"}
        </p>
      </div>
      {blocked && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {blocked}
        </p>
      )}

      <section className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <h3 className="text-sm font-semibold">
            {handOverOnly ? "Hand over their open leads" : "Deactivate"} <Badge tone="green">Recommended</Badge>
          </h3>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {handOverOnly
              ? `${name} is already inactive but still holds open leads. Give them to someone who can follow up.`
              : `${name} won't be able to sign in and gets no more round-robin leads. Their leads, calls, site visits, follow-ups and history all stay, and you can reactivate them any time.`}
          </p>
        </div>
        <p className="text-sm">
          <span className="font-medium">{openLeadsLine(check)}</span>
          {needsOwner && <span className="text-neutral-500"> must go to someone else first, so no lead is left without an owner. Closed (won/lost) leads stay with {name}.</span>}
        </p>
        {needsOwner && (
          <div className="space-y-2" role="radiogroup" aria-label="Who takes the open leads">
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="handover" className="mt-1" checked={mode === "person"} disabled={!canAct} onChange={() => setMode("person")} data-testid="mode-person" />
              <span className="flex-1">
                <span className="font-medium">Give {check.openLeads === 1 ? "it" : `all ${check.openLeads}`} to one person</span>
                {mode === "person" && (
                  <select className={`${inputClass} mt-1.5`} value={to} disabled={!canAct} onChange={(e) => setTo(e.target.value)} data-testid="reassign-to" aria-label="New owner">
                    <option value="">Pick who takes them…</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.fullName} ({o.role.name})
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </label>
            <label className={`flex items-start gap-2 text-sm ${check.shareOut.blocked ? "text-neutral-500" : ""}`}>
              <input type="radio" name="handover" className="mt-1" checked={mode === "share"} disabled={!canAct} onChange={() => setMode("share")} data-testid="mode-share" />
              <span className="flex-1">
                <span className="font-medium">Share out by round-robin</span>
                <span className="block text-neutral-500">Each lead takes the next turn in the usual rotation, so the work is spread like new leads are.</span>
                {mode === "share" && (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5" data-testid="share-preview">
                    {shareOutLines(check.shareOut).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {mode === "share" && check.shareOut.blocked && (
                  <span className="mt-1.5 block rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {check.shareOut.blocked}
                  </span>
                )}
              </span>
            </label>
          </div>
        )}
        {needsOwner && <p className="text-xs text-neutral-500">Each lead gets a line in its change history, and the new owner is notified.</p>}
        {(check.canDeactivate || handOverOnly) && (
          <button type="button" className={buttonClass} disabled={!canAct || busy || !ready} onClick={deactivate} data-testid="confirm-deactivate">
            {handOverOnly
              ? sharing ? "Share out leads" : "Hand over leads"
              : needsOwner
                ? `${sharing ? "Share out" : "Hand over"} ${check.openLeads} lead${check.openLeads === 1 ? "" : "s"} and deactivate`
                : `Deactivate ${name}`}
          </button>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="text-sm font-semibold">Delete permanently</h3>
        {check.data.length === 0 ? (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {dataLine(check.data)} is linked to this account, so it can be deleted (for example, one made by mistake). This can&apos;t be undone.
            </p>
            <button
              type="button"
              className={`${secondaryButtonClass} border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40`}
              disabled={!check.canDelete || busy}
              onClick={remove}
              data-testid="confirm-delete"
            >
              Delete {name}
            </button>
          </>
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-400" data-testid="delete-unavailable">
            Not available: {name} has {dataLine(check.data)}. Deleting would break that history, so deactivate instead.
          </p>
        )}
      </section>

      <ErrorText error={error} />
      <button type="button" className={secondaryButtonClass} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

const AUDIT_TONE: Record<UserAuditEvent["action"], "green" | "neutral" | "amber" | "blue" | "violet" | "red"> = {
  CREATED: "green",
  ROLE_CHANGED: "violet",
  DEACTIVATED: "amber",
  REACTIVATED: "green",
  LEADS_REASSIGNED: "blue",
  DELETED: "red",
};
const AUDIT_WORD: Record<UserAuditEvent["action"], string> = {
  CREATED: "Created",
  ROLE_CHANGED: "Role",
  DEACTIVATED: "Deactivated",
  REACTIVATED: "Reactivated",
  LEADS_REASSIGNED: "Leads",
  DELETED: "Deleted",
};

function AuditList({ events, showName }: { events: UserAuditEvent[]; showName?: boolean }) {
  if (events.length === 0) return <p className="text-xs text-neutral-500">No account changes recorded yet.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-2">
          <span className="w-32 shrink-0 text-xs text-neutral-500">{formatDateTime(e.createdAt)}</span>
          <Badge tone={AUDIT_TONE[e.action]}>{AUDIT_WORD[e.action]}</Badge>
          {showName && e.targetName && <span className="font-medium">{e.targetName}:</span>}
          <span>{e.message}</span>
        </li>
      ))}
    </ul>
  );
}

function UserHistory({ userId }: { userId: string }) {
  const { data, error } = useApi<UserAuditEvent[]>(`/users/${userId}/history`);
  if (error) return <ErrorText error={error} />;
  if (!data) return <p className="text-xs text-neutral-500">Loading…</p>;
  return <AuditList events={data} />;
}

/** Account changes across everyone, including people since deleted. */
function RecentChanges() {
  const { data, error } = useApi<UserAuditEvent[]>("/users/history");
  return (
    <div className={`${panelClass} space-y-3 p-5`}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <History className="size-4" aria-hidden /> Recent account changes
      </h2>
      <ErrorText error={error} />
      {data && <AuditList events={data.slice(0, 20)} showName />}
    </div>
  );
}

/**
 * Admin -> Users (#20). The normal flow is pick-a-role: a role's preset
 * decides every tag. Individual tags stay viewable under "View tags".
 */
export default function UsersPage() {
  const { can } = useAuth();
  const { user: me } = useAuth();
  const [open, setOpen] = useState<{ id: string; kind: "tags" | "history" } | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reactivate = useAction();
  const { data, error, reload } = useApi<UserRow[]>(can(TAGS.USERS_READ) ? "/users" : null);
  if (!can(TAGS.USERS_READ)) return <NoAccess tag={TAGS.USERS_READ} />;
  const canSeeTags = can(TAGS.PERMISSIONS_READ);
  const canManage = can(TAGS.USERS_MANAGE);
  const done = () => {
    setEditing(null);
    reload();
  };
  const removed = (message: string) => {
    setRemoving(null);
    setNotice(message);
    reload();
  };
  const toggle = (id: string, kind: "tags" | "history") => setOpen(open?.id === id && open.kind === kind ? null : { id, kind });
  async function bringBack(u: UserRow) {
    if (await reactivate.run(() => apiPost(`/users/${u.id}/reactivate`))) {
      setNotice(`${u.fullName} can sign in again.`);
      reload();
    }
  }
  const editingUser = data?.find((u) => u.id === editing);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle="Pick a role for each person; the role's preset decides what they can see and do. Remove deactivates someone (their history stays); only unused accounts can be deleted."
        action={
          canManage &&
          editing === null && (
            <button className={buttonClass} onClick={() => { setRemoving(null); setEditing("new"); }}>
              <UserPlus className="size-4" aria-hidden /> New user
            </button>
          )
        }
      />
      {editing === "new" && <UserForm onDone={done} onCancel={() => setEditing(null)} />}
      {editingUser && <UserForm key={editingUser.id} user={editingUser} onDone={done} onCancel={() => setEditing(null)} />}
      {removing && <RemovePanel key={removing} userId={removing} onDone={removed} onCancel={() => setRemoving(null)} />}
      {notice && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
          {notice}
        </p>
      )}
      <ErrorText error={error ?? reactivate.error} />
      {data && (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Email</th>
                <th className={thClass}>Role</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Last sign-in</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {data.map((u) => (
                <Fragment key={u.id}>
                  <tr>
                    <td className={`${tdClass} font-medium`}>
                      {u.fullName}
                      {u.phone && <div className="text-xs font-normal text-neutral-500">{u.phone}</div>}
                    </td>
                    <td className={tdClass}>{u.email}</td>
                    <td className={tdClass}>
                      <Badge tone={ROLE_BADGE[u.role.key] ?? "neutral"}>{u.role.name}</Badge>
                      {u.customTagCount > 0 && (
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">+ {u.customTagCount} custom tag change(s)</div>
                      )}
                    </td>
                    <td className={tdClass}>{u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</td>
                    <td className={`${tdClass} text-neutral-500`}>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                    <td className={`${tdClass} whitespace-nowrap text-right`}>
                      {canManage && (
                        <button
                          className="mr-3 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                          onClick={() => { setRemoving(null); setEditing(u.id); }}
                        >
                          Edit
                        </button>
                      )}
                      {canManage && u.id !== me.id && u.isActive && (
                        <button
                          className="mr-3 inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline dark:text-red-300"
                          onClick={() => { setEditing(null); setNotice(null); setRemoving(u.id); }}
                          data-testid={`remove-${u.email}`}
                        >
                          <UserMinus className="size-3.5" aria-hidden /> Remove
                        </button>
                      )}
                      {canManage && !u.isActive && (
                        <>
                          <button
                            className="mr-3 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-300"
                            disabled={reactivate.busy}
                            onClick={() => bringBack(u)}
                            data-testid={`reactivate-${u.email}`}
                          >
                            Reactivate
                          </button>
                          <button
                            className="mr-3 text-xs font-medium text-neutral-500 hover:underline"
                            onClick={() => { setEditing(null); setNotice(null); setRemoving(u.id); }}
                          >
                            Delete…
                          </button>
                        </>
                      )}
                      <button
                        className="mr-3 text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:underline dark:hover:text-neutral-200"
                        onClick={() => toggle(u.id, "history")}
                      >
                        {open?.id === u.id && open.kind === "history" ? "Hide history" : "History"}
                      </button>
                      {canSeeTags && (
                        <button
                          className="text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:underline dark:hover:text-neutral-200"
                          onClick={() => toggle(u.id, "tags")}
                        >
                          {open?.id === u.id && open.kind === "tags" ? "Hide tags" : "View tags"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open?.id === u.id && (
                    <tr>
                      <td colSpan={6} className="bg-neutral-50 px-4 py-3 dark:bg-neutral-900/60">
                        {open.kind === "tags" ? <UserTags userId={u.id} /> : <UserHistory userId={u.id} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <RecentChanges key={data.map((u) => `${u.id}${u.isActive}${u.role.key}`).join()} />}
    </div>
  );
}
