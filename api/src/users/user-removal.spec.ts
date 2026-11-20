import { BadRequestException, ConflictException } from '@nestjs/common';
import { PERMISSION_DEFINITIONS, PERMISSIONS, ROLE_DEFINITIONS } from '../access-control/permission-catalog.js';
import { attachedData, LAST_ADMIN_MESSAGE, wouldRemoveLastAdmin } from './user-removal.js';
import { UsersService } from './users.service.js';

interface FakeUser {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roleKey: string;
  counts?: Record<string, number>;
  tags?: string[];
}
interface FakeLead {
  id: string;
  name: string;
  status: string;
  assignedToId: string | null;
  telecallerId: string | null;
  qualifiedAt: Date | null;
  autoAssigned?: boolean;
}

const ROLE_NAMES: Record<string, string> = { admin: 'Admin', sales: 'Sales', telecaller: 'Telecaller' };
const OPEN = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED'];
const admin = { id: 'a1', fullName: 'Precon Admin' };

/** A small in-memory stand-in for the Prisma calls UsersService makes. */
function setup(users: FakeUser[], leads: FakeLead[] = []) {
  const audits: { action: string; message: string; targetUserId: string | null; targetName: string; actorName: string; details?: unknown }[] = [];
  const activities: { leadId: string; message: string }[] = [];
  const notifications: { userId: string; leadId: string; body: string }[] = [];
  const deleted: string[] = [];
  const byId = (id: string) => users.find((u) => u.id === id);
  const row = (u: FakeUser) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: null,
    isActive: u.isActive,
    lastLoginAt: null,
    role: { key: u.roleKey, name: ROLE_NAMES[u.roleKey] },
    _count: { ...(u.counts ?? {}), permissionOverrides: 0 },
  });
  type Where = { id?: string | { not?: string; in?: string[] }; isActive?: boolean; role?: { key: string }; assignedToId?: string; status?: { in: string[] } };
  const matchUser = (u: FakeUser, w: Where = {}) =>
    (typeof w.id !== 'object' || (w.id.not === undefined || u.id !== w.id.not)) &&
    (typeof w.id !== 'string' || u.id === w.id) &&
    (w.isActive === undefined || u.isActive === w.isActive) &&
    (!w.role || u.roleKey === w.role.key);
  const matchLead = (l: FakeLead, w: Where) =>
    (!w.assignedToId || l.assignedToId === w.assignedToId) &&
    (!w.status || w.status.in.includes(l.status)) &&
    (!(typeof w.id === 'object' && w.id.in) || w.id.in.includes(l.id));

  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        const u = where.id ? byId(where.id) : users.find((x) => x.email === where.email);
        return u && !deleted.includes(u.id) ? row(u) : null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => row(byId(where.id)!)),
      findMany: vi.fn(async ({ where }: { where: Where }) => users.filter((u) => !deleted.includes(u.id) && matchUser(u, where)).map(row)),
      count: vi.fn(async ({ where }: { where: Where }) => users.filter((u) => !deleted.includes(u.id) && matchUser(u, where)).length),
      create: vi.fn(async ({ data }: { data: { email: string; fullName: string; roleId: string } }) => {
        const u = { id: `new-${users.length}`, fullName: data.fullName, email: data.email, isActive: true, roleKey: data.roleId };
        users.push(u);
        return { id: u.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { isActive?: boolean; roleId?: string } }) => {
        const u = byId(where.id)!;
        if (data.isActive !== undefined) u.isActive = data.isActive;
        if (data.roleId) u.roleKey = data.roleId;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => deleted.push(where.id)),
    },
    role: { findUnique: vi.fn(async ({ where }: { where: { key: string } }) => ({ id: where.key, name: ROLE_NAMES[where.key] })) },
    userPermission: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    lead: {
      count: vi.fn(async ({ where }: { where: Where }) => leads.filter((l) => matchLead(l, where)).length),
      findMany: vi.fn(async ({ where }: { where: Where }) => leads.filter((l) => matchLead(l, where))),
      groupBy: vi.fn(async ({ where }: { where: Where }) => {
        const counts = new Map<string, number>();
        for (const l of leads.filter((x) => matchLead(x, where))) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
        return [...counts].map(([status, n]) => ({ status, _count: { _all: n } }));
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<FakeLead> }) => {
        for (const l of leads.filter((x) => matchLead(x, where))) Object.assign(l, data);
      }),
    },
    leadActivity: { create: vi.fn(async ({ data }: { data: { leadId: string; message: string } }) => activities.push(data)) },
    notification: { createMany: vi.fn(async ({ data }: { data: { userId: string; leadId: string; body: string }[] }) => notifications.push(...data)) },
    userAuditEvent: { create: vi.fn(async ({ data }: { data: (typeof audits)[number] }) => audits.push(data)) },
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  const accessControl = {
    getEffectiveAccess: vi.fn(async (id: string) => {
      const u = byId(id)!;
      const fromRole = u.roleKey === 'telecaller' ? ['leads.read', 'leads.auto_assign'] : u.roleKey === 'factory_supervisor' ? [] : ['leads.read'];
      return { permissions: u.tags ?? fromRole, modules: [] };
    }),
  };
  return { service: new UsersService(db as never, accessControl as never), users, leads, audits, activities, notifications, deleted, db };
}

const people = (): FakeUser[] => [
  { id: 'a1', fullName: 'Precon Admin', email: 'admin@x.in', isActive: true, roleKey: 'admin' },
  { id: 's1', fullName: 'Suresh', email: 's1@x.in', isActive: true, roleKey: 'sales', counts: { assignedLeads: 3, callLogs: 5 } },
  { id: 's2', fullName: 'Meena', email: 's2@x.in', isActive: true, roleKey: 'sales' },
  { id: 't1', fullName: 'Tara', email: 't1@x.in', isActive: true, roleKey: 'telecaller' },
  { id: 'f1', fullName: 'Factory Fred', email: 'f1@x.in', isActive: true, roleKey: 'factory_supervisor' },
];

describe('admins', () => {
  it('the Admin preset is every tag except the two round-robin switches, so a second admin sees every tab', () => {
    const preset = ROLE_DEFINITIONS.find((r) => r.key === 'admin')!.defaultPermissions;
    const all = PERMISSION_DEFINITIONS.map((p) => p.key);
    expect(all.filter((k) => !preset.includes(k)).sort()).toEqual([PERMISSIONS.LEADS_AUTO_ASSIGN, PERMISSIONS.LEADS_RECEIVE_QUALIFIED].sort());
  });

  it('an admin can create another admin, and it is recorded', async () => {
    const { service, users, audits } = setup(people());
    const created = await service.create(admin, { fullName: 'Second Admin', email: 'two@x.in', roleKey: 'admin', password: 'Precon@2026' });
    expect(created.role.key).toBe('admin');
    expect(users.filter((u) => u.roleKey === 'admin' && u.isActive)).toHaveLength(2);
    expect(audits[0]).toMatchObject({ action: 'CREATED', message: 'Created as Admin by Precon Admin', actorName: 'Precon Admin' });
  });

  it('the last active admin cannot be demoted or switched off by another user', async () => {
    const list = people();
    list.push({ id: 'x', fullName: 'Ops Lead', email: 'x@x.in', isActive: true, roleKey: 'sales' });
    const { service, users } = setup(list);
    const ops = { id: 'x', fullName: 'Ops Lead' }; // e.g. a user with users.manage granted as an extra tag
    await expect(service.update(ops, 'a1', { roleKey: 'sales' })).rejects.toThrow(LAST_ADMIN_MESSAGE);
    await expect(service.update(ops, 'a1', { isActive: false })).rejects.toThrow(LAST_ADMIN_MESSAGE);
    await expect(service.deactivate(ops, 'a1', {})).rejects.toThrow(LAST_ADMIN_MESSAGE);
    await expect(service.remove(ops, 'a1')).rejects.toThrow(LAST_ADMIN_MESSAGE);
    await expect(service.setPermissionOverrides('x', 'a1', { grant: [], revoke: ['users.manage'] })).rejects.toThrow(LAST_ADMIN_MESSAGE);
    expect(users.find((u) => u.id === 'a1')).toMatchObject({ isActive: true, roleKey: 'admin' });
  });

  it('with a second admin, one admin can be demoted, and the role change is recorded', async () => {
    const list = people();
    list.push({ id: 'a2', fullName: 'Second Admin', email: 'a2@x.in', isActive: true, roleKey: 'admin' });
    const { service, users, audits } = setup(list);
    await service.update(admin, 'a2', { roleKey: 'sales' });
    expect(users.find((u) => u.id === 'a2')!.roleKey).toBe('sales');
    expect(audits).toEqual([expect.objectContaining({ action: 'ROLE_CHANGED', message: 'Role changed by Precon Admin: Admin → Sales', details: { from: 'Admin', to: 'Sales' } })]);
    // …and now Precon Admin is the last one again.
    await expect(service.update({ id: 's2', fullName: 'Meena' }, 'a1', { roleKey: 'sales' })).rejects.toThrow(LAST_ADMIN_MESSAGE);
  });

  it('an inactive admin does not count as the admin who remains', async () => {
    const list = people();
    list.push({ id: 'a2', fullName: 'Old Admin', email: 'a2@x.in', isActive: false, roleKey: 'admin' });
    const { service } = setup(list);
    await expect(service.update({ id: 'a2', fullName: 'Old Admin' }, 'a1', { isActive: false })).rejects.toThrow(LAST_ADMIN_MESSAGE);
  });

  it('nobody can deactivate, delete or demote themselves', async () => {
    const { service } = setup(people());
    await expect(service.deactivate(admin, 'a1', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.remove(admin, 'a1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(admin, 'a1', { roleKey: 'sales' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('deactivating a user', () => {
  const salesLeads = (): FakeLead[] => [
    { id: 'L1', name: 'Ravi', status: 'QUALIFIED', assignedToId: 's1', telecallerId: 't1', qualifiedAt: new Date() },
    { id: 'L2', name: 'Kumar', status: 'QUOTED', assignedToId: 's1', telecallerId: 't1', qualifiedAt: new Date() },
    { id: 'L3', name: 'Done deal', status: 'WON', assignedToId: 's1', telecallerId: 't1', qualifiedAt: new Date() },
  ];

  it('is refused while they hold open leads and nobody is picked to take them', async () => {
    const { service, users, leads } = setup(people(), salesLeads());
    await expect(service.deactivate(admin, 's1', {})).rejects.toThrow('Suresh has 2 open leads. Pick who should take them before deactivating.');
    await expect(service.update(admin, 's1', { isActive: false })).rejects.toThrow(/still has 2 open leads/);
    expect(users.find((u) => u.id === 's1')!.isActive).toBe(true);
    expect(leads.every((l) => l.assignedToId === 's1')).toBe(true);
  });

  it('hands the open leads over (history + notification each), keeps closed ones, then switches them off', async () => {
    const { service, users, leads, activities, notifications, audits } = setup(people(), salesLeads());
    const result = await service.deactivate(admin, 's1', { reassignToId: 's2' });
    expect(result).toMatchObject({ isActive: false, leadsReassigned: 2, reassignedTo: { id: 's2', fullName: 'Meena' } });
    expect(users.find((u) => u.id === 's1')!.isActive).toBe(false);
    expect(leads.map((l) => [l.id, l.assignedToId])).toEqual([['L1', 's2'], ['L2', 's2'], ['L3', 's1']]);
    expect(leads.find((l) => l.id === 'L1')!.telecallerId).toBe('t1'); // telecaller credit unchanged
    expect(activities.map((a) => a.leadId)).toEqual(['L1', 'L2']);
    expect(activities[0].message).toBe('Reassigned by Precon Admin when Suresh was deactivated: Suresh → Meena');
    expect(notifications).toEqual([
      expect.objectContaining({ userId: 's2', leadId: 'L1', body: 'Reassigned to you by Precon Admin (was Suresh)' }),
      expect.objectContaining({ userId: 's2', leadId: 'L2' }),
    ]);
    expect(audits.map((a) => [a.action, a.message])).toEqual([
      ['LEADS_REASSIGNED', '2 open leads handed to Meena by Precon Admin'],
      ['DEACTIVATED', 'Deactivated by Precon Admin; 2 open leads handed to Meena'],
    ]);
  });

  it("a telecaller's unqualified leads given to another telecaller count on the new one's scorecard", async () => {
    const list = people();
    list.push({ id: 't2', fullName: 'Uma', email: 't2@x.in', isActive: true, roleKey: 'telecaller' });
    const { service, leads } = setup(list, [{ id: 'N1', name: 'New one', status: 'NEW', assignedToId: 't1', telecallerId: 't1', qualifiedAt: null }]);
    await service.deactivate(admin, 't1', { reassignToId: 't2' });
    expect(leads[0]).toMatchObject({ assignedToId: 't2', telecallerId: 't2', autoAssigned: false });
  });

  it('the new owner must be someone else, active, and able to work leads', async () => {
    const list = people();
    list.push({ id: 'gone', fullName: 'Gone', email: 'g@x.in', isActive: false, roleKey: 'sales' });
    const { service, users } = setup(list, salesLeads());
    await expect(service.deactivate(admin, 's1', { reassignToId: 's1' })).rejects.toThrow(/someone other/);
    await expect(service.deactivate(admin, 's1', { reassignToId: 'gone' })).rejects.toThrow(/active user who can work leads/);
    await expect(service.deactivate(admin, 's1', { reassignToId: 'f1' })).rejects.toThrow(/active user who can work leads/);
    expect(users.find((u) => u.id === 's1')!.isActive).toBe(true);
  });

  it('with no open leads it just switches them off; reactivating brings them back; both are recorded', async () => {
    const { service, users, audits } = setup(people());
    await service.deactivate(admin, 's2', {});
    expect(users.find((u) => u.id === 's2')!.isActive).toBe(false);
    await service.reactivate(admin, 's2');
    expect(users.find((u) => u.id === 's2')!.isActive).toBe(true);
    expect(audits.map((a) => a.message)).toEqual(['Deactivated by Precon Admin', 'Reactivated by Precon Admin']);
  });

  it('the removal check lists open leads, data, and who can take the leads', async () => {
    const { service } = setup(people(), salesLeads());
    const check = await service.removalCheck(admin, 's1');
    expect(check).toMatchObject({ openLeads: 2, openLeadsByStatus: { QUALIFIED: 1, QUOTED: 1 }, canDeactivate: true, canDelete: false, lastAdmin: false });
    expect(check.data.map((d) => d.label)).toEqual(['logged calls', 'leads assigned to them']);
    expect(check.assignees.map((a) => a.fullName)).toEqual(['Precon Admin', 'Meena', 'Tara']); // not Suresh, not Fred (no leads.read)
  });
});

describe('deleting a user', () => {
  it('is only allowed when nothing points at them; it is recorded by name', async () => {
    const { service, deleted, audits } = setup(people());
    expect((await service.removalCheck(admin, 's2')).canDelete).toBe(true);
    await service.remove(admin, 's2');
    expect(deleted).toEqual(['s2']);
    expect(audits[0]).toMatchObject({ action: 'DELETED', targetUserId: null, targetName: 'Meena', message: 'Deleted permanently by Precon Admin (had no data)' });
  });

  it('is refused for anyone with data: deactivate instead', async () => {
    const { service, deleted } = setup(people());
    const err = await service.remove(admin, 's1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe("Suresh can't be deleted because they have 5 logged calls, 3 leads assigned to them. Deactivate them instead; their history stays.");
    expect(deleted).toEqual([]);
  });
});

describe('rules', () => {
  it('attachedData keeps the non-zero lines, biggest first', () => {
    expect(attachedData({ callLogs: 2, siteVisits: 0, assignedLeads: 9, permissionOverrides: 4 })).toEqual([
      { key: 'assignedLeads', label: 'leads assigned to them', count: 9 },
      { key: 'callLogs', label: 'logged calls', count: 2 },
    ]);
  });

  it('wouldRemoveLastAdmin', () => {
    expect(wouldRemoveLastAdmin({ isActive: true, roleKey: 'admin' }, 0)).toBe(true);
    expect(wouldRemoveLastAdmin({ isActive: true, roleKey: 'admin' }, 1)).toBe(false);
    expect(wouldRemoveLastAdmin({ isActive: false, roleKey: 'admin' }, 0)).toBe(false);
    expect(wouldRemoveLastAdmin({ isActive: true, roleKey: 'sales' }, 0)).toBe(false);
  });
});
