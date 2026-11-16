/**
 * Syncs permission tags and roles (with their default tags) to the catalog in
 * src/access-control/permission-catalog.ts. Used by the demo seed and by the
 * production bootstrap, which must not create any demo data.
 */
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  PERMISSION_DEFINITIONS,
  ROLE_DEFINITIONS,
} from '../src/access-control/permission-catalog.js';

/** Returns each role's id by key. */
export async function syncRolesAndPermissions(
  prisma: PrismaClient,
): Promise<Map<string, string>> {
  // 1. Permission tags
  for (const p of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: p,
      update: { module: p.module, description: p.description },
    });
  }
  const permissionIdByKey = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } })).map(
      (p) => [p.key, p.id],
    ),
  );

  // 2. Roles and their default tags (synced exactly to the catalog)
  const roleIdByKey = new Map<string, string>();
  for (const r of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      create: { key: r.key, name: r.name, description: r.description },
      update: { name: r.name, description: r.description },
    });
    roleIdByKey.set(r.key, role.id);

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: r.defaultPermissions.map((key) => ({
          roleId: role.id,
          permissionId: permissionIdByKey.get(key)!,
        })),
      }),
    ]);
  }
  return roleIdByKey;
}
