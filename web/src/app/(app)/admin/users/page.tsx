"use client";

import { UserPlus } from "lucide-react";
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
import { apiPatch, apiPost } from "@/lib/api";
import { formatDateTime } from "@/lib/crm";
import { MODULES, ModuleKey, moduleForTagModule } from "@/lib/modules";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

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
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
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
            ...(isActive !== user.isActive ? { isActive } : {}),
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
        {user && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={isActive} disabled={isMe} onChange={(e) => setIsActive(e.target.checked)} />
            Active (can sign in)
          </label>
        )}
      </div>
      {isMe && <p className="text-xs text-neutral-500">You can&apos;t change your own role or deactivate yourself.</p>}
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
 * Admin -> Users (#20). The normal flow is pick-a-role: a role's preset
 * decides every tag. Individual tags stay viewable under "View tags".
 */
export default function UsersPage() {
  const { can } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { data, error, reload } = useApi<UserRow[]>(can(TAGS.USERS_READ) ? "/users" : null);
  if (!can(TAGS.USERS_READ)) return <NoAccess tag={TAGS.USERS_READ} />;
  const canSeeTags = can(TAGS.PERMISSIONS_READ);
  const canManage = can(TAGS.USERS_MANAGE);
  const done = () => {
    setEditing(null);
    reload();
  };
  const editingUser = data?.find((u) => u.id === editing);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle="Pick a role for each person; the role's preset decides what they can see and do."
        action={
          canManage &&
          editing === null && (
            <button className={buttonClass} onClick={() => setEditing("new")}>
              <UserPlus className="size-4" aria-hidden /> New user
            </button>
          )
        }
      />
      {editing === "new" && <UserForm onDone={done} onCancel={() => setEditing(null)} />}
      {editingUser && <UserForm key={editingUser.id} user={editingUser} onDone={done} onCancel={() => setEditing(null)} />}
      <ErrorText error={error} />
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
                          onClick={() => setEditing(u.id)}
                        >
                          Edit
                        </button>
                      )}
                      {canSeeTags && (
                        <button
                          className="text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:underline dark:hover:text-neutral-200"
                          onClick={() => setOpen(open === u.id ? null : u.id)}
                        >
                          {open === u.id ? "Hide tags" : "View tags"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === u.id && (
                    <tr>
                      <td colSpan={6} className="bg-neutral-50 px-4 py-3 dark:bg-neutral-900/60">
                        <UserTags userId={u.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
