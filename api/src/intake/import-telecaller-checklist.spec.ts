import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS, ROLE_DEFINITIONS } from '../access-control/permission-catalog.js';
import { UsersService } from '../users/users.service.js';
import { ImportOptionsDto } from './dto/intake.dto.js';
import { LeadAssignmentService } from './lead-assignment.service.js';
import { LeadImportService, NO_TELECALLER_TICKED } from './lead-import.service.js';

const importer: AuthenticatedUser = {
  id: 'admin',
  email: 'a@x.in',
  fullName: 'Asha Admin',
  role: { key: 'admin', name: 'Admin' },
  permissions: ['leads.read', 'leads.read_all', 'leads.write', 'leads.import'],
  modules: ['crm'],
  token: { jti: 'j', expiresAt: new Date() },
};

const members = [
  { id: 'kavya', fullName: 'Kavya', autoAssignEnabled: true },
  { id: 'arjun', fullName: 'Arjun', autoAssignEnabled: true },
  { id: 'tara', fullName: 'Tara', autoAssignEnabled: false }, // switched off globally
];

/** An import service whose intake records what each row was created with. */
function importSetup() {
  const created: { rotation?: string[]; rotationChosen?: boolean }[] = [];
  const intake = {
    create: vi.fn(async (input: { rotation?: string[]; rotationChosen?: boolean }) => {
      created.push(input);
      const who = input.rotation?.[created.length % (input.rotation?.length || 1)];
      return { status: 'created', leadId: `lead-${created.length}`, assignedTo: who ? { id: who, fullName: who } : null, autoAssigned: Boolean(who) };
    }),
  };
  const assignment = {
    members: vi.fn(async () => members),
    rotationIds: vi.fn(async () => members.filter((m) => m.autoAssignEnabled).map((m) => m.id)),
  };
  const accessControl = { activeUsersWithAnyTag: vi.fn(async () => []) };
  const service = new LeadImportService({} as never, intake as never, accessControl as never, assignment as never);
  return { service, created, assignment };
}

const csv = (rows: number) => ({
  originalname: 'leads.csv',
  buffer: Buffer.from('phone\n' + Array.from({ length: rows }, (_, i) => String(9000090001 + i)).join('\n') + '\n'),
  size: 100,
});

describe('import: the per-upload telecaller checklist', () => {
  it('the checklist lists every telecaller, ticked only if their round-robin switch is on', async () => {
    const { service } = importSetup();
    expect(await service.telecallers()).toEqual([
      { id: 'kavya', fullName: 'Kavya', inRoundRobin: true },
      { id: 'arjun', fullName: 'Arjun', inRoundRobin: true },
      { id: 'tara', fullName: 'Tara', inRoundRobin: false },
    ]);
  });

  it('blank rows go round-robin among only the ticked telecallers', async () => {
    const { service, created } = importSetup();
    const report = await service.import(importer, csv(4), { telecallerIds: ['kavya'] });
    expect(report.created).toBe(4);
    expect(created.every((c) => c.rotationChosen === true && c.rotation?.join() === 'kavya')).toBe(true);
    expect(report.assignments).toEqual([expect.objectContaining({ userId: 'kavya', count: 4 })]);
  });

  it('someone switched off globally can still be ticked for this one upload', async () => {
    const { service, created } = importSetup();
    await service.import(importer, csv(2), { telecallerIds: ['tara', 'arjun'] });
    expect(created[0]).toMatchObject({ rotation: ['tara', 'arjun'], rotationChosen: true });
  });

  it('nobody ticked: refused with a clear message, and nothing is created', async () => {
    const { service, created } = importSetup();
    const attempt = service.import(importer, csv(2), { telecallerIds: [] });
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.import(importer, csv(2), { telecallerIds: [] })).rejects.toThrow(NO_TELECALLER_TICKED);
    expect(NO_TELECALLER_TICKED).toBe('Select at least one telecaller to receive these leads.');
    expect(created).toHaveLength(0);
  });

  it("someone who can't receive leads (not a telecaller, or deactivated) can't be ticked", async () => {
    const { service, created } = importSetup();
    await expect(service.import(importer, csv(1), { telecallerIds: ['kavya', 'sales-suresh'] })).rejects.toThrow(/can't receive leads/);
    expect(created).toHaveLength(0);
  });

  it('without a checklist (older callers) the global round-robin is used, honouring the switch', async () => {
    const { service, created } = importSetup();
    await service.import(importer, csv(1));
    expect(created[0]).toMatchObject({ rotation: ['kavya', 'arjun'], rotationChosen: false });
  });

  it('the form field arrives as comma-separated ids; blank means nobody ticked; missing means not sent', async () => {
    const a = '0b9c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d';
    const b = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
    const parsed = plainToInstance(ImportOptionsDto, { telecallerIds: `${a}, ${b}` });
    expect(parsed.telecallerIds).toEqual([a, b]);
    expect(await validate(parsed)).toEqual([]);
    expect(plainToInstance(ImportOptionsDto, { telecallerIds: '' }).telecallerIds).toEqual([]);
    expect(plainToInstance(ImportOptionsDto, {}).telecallerIds).toBeUndefined();
    expect(await validate(plainToInstance(ImportOptionsDto, { telecallerIds: 'not-an-id' }))).not.toEqual([]);
  });
});

describe('round-robin pick: the global switch vs a hand-picked upload', () => {
  function pickSetup() {
    const queries: { where: Record<string, unknown> }[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => []),
      user: {
        findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
          queries.push(args);
          return [{ id: 'tara', fullName: 'Tara', lastAutoAssignedAt: null }];
        }),
        update: vi.fn(async () => ({})),
      },
    };
    return { service: new LeadAssignmentService({} as never, {} as never), tx, queries };
  }

  it('automatic paths (API, Meta, quick add) only pick people switched on', async () => {
    const { service, tx, queries } = pickSetup();
    await service.pickNext(tx as never, ['tara']);
    expect(queries[0].where).toMatchObject({ autoAssignEnabled: true, isActive: true });
  });

  it("a hand-picked upload uses exactly the ticked people, whatever their switch says (and doesn't change it)", async () => {
    const { service, tx, queries } = pickSetup();
    expect(await service.pickNext(tx as never, ['tara'], { chosen: true })).toEqual({ id: 'tara', fullName: 'Tara' });
    expect(queries[0].where).not.toHaveProperty('autoAssignEnabled');
    expect(queries[0].where).toMatchObject({ isActive: true });
    const update = tx.user.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(Object.keys(update[0].data)).toEqual(['lastAutoAssignedAt']);
  });
});

describe('leads.import: who can import', () => {
  const preset = (key: string) => ROLE_DEFINITIONS.find((r) => r.key === key)!.defaultPermissions;

  it('admin and sales have it by default (as before); telecallers do not until granted', () => {
    expect(preset('admin')).toContain(PERMISSIONS.LEADS_IMPORT);
    expect(preset('sales')).toContain(PERMISSIONS.LEADS_IMPORT);
    expect(preset('telecaller')).not.toContain(PERMISSIONS.LEADS_IMPORT);
    expect(preset('factory_supervisor')).not.toContain(PERMISSIONS.LEADS_IMPORT);
  });

  function usersSetup(summary: { role: string; rolePermissions: string[]; granted: string[]; revoked: string[] }) {
    const service = new UsersService({} as never, {} as never, {} as never);
    const saved: { grant: string[]; revoke: string[] }[] = [];
    vi.spyOn(service, 'getPermissionSummary').mockResolvedValue({ userId: 'u1', email: 'u@x.in', effective: { permissions: [], modules: [] }, ...summary });
    vi.spyOn(service, 'setPermissionOverrides').mockImplementation(async (_actor, _id, dto) => {
      saved.push(dto);
      return {} as never;
    });
    vi.spyOn(service, 'importAccess').mockResolvedValue([]);
    return { service, saved };
  }

  it('ticking a telecaller grants leads.import to them alone and keeps their other custom tags', async () => {
    const { service, saved } = usersSetup({ role: 'telecaller', rolePermissions: ['leads.read'], granted: ['leads.audit'], revoked: ['reports.view'] });
    await service.setImportAccess(importer, 'u1', true);
    expect(saved).toEqual([{ grant: ['leads.audit', 'leads.import'], revoke: ['reports.view'] }]);
  });

  it('unticking removes the grant again', async () => {
    const { service, saved } = usersSetup({ role: 'telecaller', rolePermissions: ['leads.read'], granted: ['leads.import'], revoked: [] });
    await service.setImportAccess(importer, 'u1', false);
    expect(saved).toEqual([{ grant: [], revoke: [] }]);
  });

  it("for a role that has it (sales), unticking revokes it for that person; admins can't lose it", async () => {
    const sales = usersSetup({ role: 'sales', rolePermissions: ['leads.import'], granted: [], revoked: [] });
    await sales.service.setImportAccess(importer, 'u1', false);
    expect(sales.saved).toEqual([{ grant: [], revoke: ['leads.import'] }]);

    const admin = usersSetup({ role: 'admin', rolePermissions: ['leads.import'], granted: [], revoked: [] });
    await expect(admin.service.setImportAccess(importer, 'u1', false)).rejects.toThrow(/Admins can always import/);
    expect(admin.saved).toEqual([]);
  });
});
