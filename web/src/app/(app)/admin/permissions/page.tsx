"use client";

import { Check } from "lucide-react";
import { Fragment } from "react";
import { useAuth } from "@/components/auth-provider";
import {
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
import { TAGS } from "@/lib/tags";
import { useApi } from "@/lib/use-api";

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
