"use client";

import { Check, Upload } from "lucide-react";
import { Fragment } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Badge,
  ErrorText,
  panelClass,
  NoAccess,
  PageHeader,
  tableClass,
  tableWrapClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { apiPut } from "@/lib/api";
import { TAGS } from "@/lib/tags";
import { useAction, useApi } from "@/lib/use-api";

interface Role {
  key: string;
  name: string;
  description: string | null;
  userCount: number;
  permissions: string[];
}

interface Permission {
  key: string;
  module: string;
  description: string;
}

interface ImportAccessRow {
  id: string;
  fullName: string;
  email: string;
  role: { key: string; name: string };
  canImport: boolean;
  fromRole: boolean;
}

/**
 * Who may import leads (leads.import). Admins always can, so they aren't listed.
 * Ticking a telecaller grants the tag to that one person; nobody else changes.
 */
function ImportAccess() {
  const { can } = useAuth();
  const canChange = can(TAGS.PERMISSIONS_ASSIGN);
  const { data, error, reload } = useApi<ImportAccessRow[]>("/users/import-access");
  const save = useAction();

  async function toggle(row: ImportAccessRow) {
    const ok = await save.run(() => apiPut(`/users/${row.id}/import-access`, { enabled: !row.canImport }));
    if (ok) reload();
  }

  return (
    <section className={`${panelClass} mb-6 p-5`} aria-labelledby="import-access-heading">
      <h2 id="import-access-heading" className="flex items-center gap-2 font-semibold">
        <Upload className="size-4 text-brand-600" aria-hidden /> Who can import leads
      </h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Admins can always import, and sales can by default. Telecallers can&apos;t until you tick them here; they then see Import on
        the Leads page and choose which telecallers share each upload.
      </p>
      <ErrorText error={error ?? save.error} />
      {data && data.length === 0 && <p className="mt-3 text-sm text-neutral-500">No other active users yet.</p>}
      {data && data.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
          {data.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <label className="flex min-w-0 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={row.canImport}
                  disabled={!canChange || save.busy}
                  onChange={() => toggle(row)}
                />
                <span className="min-w-0">
                  <span className="font-medium">{row.fullName}</span>{" "}
                  <span className="text-neutral-500">{row.email}</span>
                </span>
              </label>
              <span className="flex items-center gap-2">
                <Badge tone={row.role.key === "telecaller" ? "blue" : "violet"}>{row.role.name}</Badge>
                {row.canImport && !row.fromRole && <Badge tone="green">granted</Badge>}
                {!row.canImport && row.fromRole && <Badge tone="red">revoked</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Admin: the permission-tag catalog and which tags each role gets by default (read-only). */
export default function PermissionsPage() {
  const { can } = useAuth();
  const allowed = can(TAGS.PERMISSIONS_READ);
  const roles = useApi<Role[]>(allowed ? "/roles" : null);
  const permissions = useApi<Permission[]>(allowed ? "/permissions" : null);
  if (!allowed) return <NoAccess tag={TAGS.PERMISSIONS_READ} />;

  const modules = [...new Set((permissions.data ?? []).map((p) => p.module))];

  return (
    <>
      <PageHeader
        title="Permissions & tags"
        subtitle="Each role's default tags. Individual users can be granted extra tags or have some revoked; see Users."
      />
      <ImportAccess />
      <ErrorText error={roles.error ?? permissions.error} />
      {roles.data && permissions.data && (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Tag</th>
                {roles.data.map((r) => (
                  <th key={r.key} className={`${thClass} text-center`}>
                    {r.name}
                    <div className="font-normal normal-case tracking-normal text-neutral-400">
                      {r.userCount} user{r.userCount === 1 ? "" : "s"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {modules.map((module) => (
                <Fragment key={module}>
                  <tr>
                    <td
                      colSpan={roles.data!.length + 1}
                      className="bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:bg-neutral-900/60"
                    >
                      {module}
                    </td>
                  </tr>
                  {permissions.data!
                    .filter((p) => p.module === module)
                    .map((p) => (
                      <tr key={p.key}>
                        <td className={tdClass}>
                          <code className="text-xs font-semibold">{p.key}</code>
                          <div className="text-xs text-neutral-500">{p.description}</div>
                        </td>
                        {roles.data!.map((r) => (
                          <td key={r.key} className={`${tdClass} text-center`}>
                            {r.permissions.includes(p.key) ? (
                              <Check className="mx-auto size-4 text-emerald-600" aria-label="yes" />
                            ) : (
                              <span className="text-neutral-300 dark:text-neutral-700" aria-label="no">
                                –
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
