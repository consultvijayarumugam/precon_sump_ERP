"use client";

import { Fragment, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Badge,
  ErrorText,
  NoAccess,
  PageHeader,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { formatDateTime } from "@/lib/crm";
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  role: { key: string; name: string };
}

interface PermissionSummary {
  rolePermissions: string[];
  granted: string[];
  revoked: string[];
  effective: { permissions: string[]; modules: string[] };
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

/** Admin: who has access (read-only view of the existing users API). */
export default function UsersPage() {
  const { can } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const { data, error } = useApi<UserRow[]>(can(TAGS.USERS_READ) ? "/users" : null);
  if (!can(TAGS.USERS_READ)) return <NoAccess tag={TAGS.USERS_READ} />;
  const canSeeTags = can(TAGS.PERMISSIONS_READ);

  return (
    <>
      <PageHeader title="Users" subtitle="Everyone who can sign in, their role, and (with permissions.read) their effective tags." />
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
                {canSeeTags && <th className={thClass}></th>}
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
                    <td className={tdClass}>{u.role.name}</td>
                    <td className={tdClass}>{u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</td>
                    <td className={`${tdClass} text-neutral-500`}>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                    {canSeeTags && (
                      <td className={`${tdClass} text-right`}>
                        <button
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
                          onClick={() => setOpen(open === u.id ? null : u.id)}
                        >
                          {open === u.id ? "Hide tags" : "View tags"}
                        </button>
                      </td>
                    )}
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
    </>
  );
}
