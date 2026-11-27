import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { LeadOwnershipService } from '../intake/lead-ownership.service.js';
import { ownershipMove, stageSide } from './stage-sides.js';

// The live server's stages: custom ones like Interested, Details Shared (handover), Quote Shared, RNR.
const NEW = { kind: 'ENTRY', phase: 'NEW' };
const INTERESTED = { kind: 'MIDDLE', phase: 'CONTACTED' };
const DETAILS_SHARED = { kind: 'MIDDLE', phase: 'QUALIFIED' };
const QUOTE_SHARED = { kind: 'MIDDLE', phase: 'QUOTED' };
const WON = { kind: 'WON', phase: 'WON' };
const LOST = { kind: 'LOST', phase: 'LOST' };

describe('which side of the handover a stage is on', () => {
  it('New and the stages before the handover are the telecaller side', () => {
    expect(stageSide(NEW)).toBe('telecaller');
    expect(stageSide(INTERESTED)).toBe('telecaller');
  });
  it('the handover stage, everything after it, and Won are the sales side; Lost just closes', () => {
    expect(stageSide(DETAILS_SHARED)).toBe('sales');
    expect(stageSide(QUOTE_SHARED)).toBe('sales');
    expect(stageSide(WON)).toBe('sales');
    expect(stageSide(LOST)).toBe('closed');
  });
});

describe('ownership follows the stage', () => {
  it("a telecaller's (or nobody's) lead moved into or past the handover is handed to sales", () => {
    expect(ownershipMove({ target: 'sales', ownerIsSales: false, handedOver: false })).toBe('handover');
    expect(ownershipMove({ target: 'sales', ownerIsSales: false, handedOver: true })).toBe('handover');
  });
  it('a handed-over lead moved back before the handover goes back to a telecaller', () => {
    expect(ownershipMove({ target: 'telecaller', ownerIsSales: true, handedOver: true })).toBe('return');
  });
  it("moves within a side, closing as Lost, and a salesperson's own walk-in lead change nothing", () => {
    expect(ownershipMove({ target: 'telecaller', ownerIsSales: false, handedOver: false })).toBe('none');
    expect(ownershipMove({ target: 'sales', ownerIsSales: true, handedOver: true })).toBe('none');
    expect(ownershipMove({ target: 'closed', ownerIsSales: false, handedOver: false })).toBe('none');
    expect(ownershipMove({ target: 'closed', ownerIsSales: true, handedOver: true })).toBe('none');
    expect(ownershipMove({ target: 'telecaller', ownerIsSales: true, handedOver: false })).toBe('none');
  });
});

describe('carrying out a handover or a return', () => {
  const actor: AuthenticatedUser = {
    id: 'tara',
    email: 't@x.in',
    fullName: 'Tara Telecaller',
    role: { key: 'telecaller', name: 'Telecaller' },
    permissions: ['leads.read', 'leads.qualify', 'leads.auto_assign'],
    modules: ['crm'],
    token: { jti: 'j', expiresAt: new Date() },
  };
  const tags: Record<string, string[]> = { tara: ['leads.auto_assign'], suresh: ['leads.receive_qualified'], kavya: ['leads.auto_assign'] };

  function setup({ sales = ['suresh'], telecallers = [{ id: 'tara', autoAssignEnabled: true }, { id: 'kavya', autoAssignEnabled: true }] } = {}) {
    const updates: { data: Record<string, unknown> }[] = [];
    const activities: { type: string; message: string }[] = [];
    const followUps: unknown[] = [];
    const accessControl = { getEffectiveAccess: vi.fn(async (id: string) => ({ permissions: tags[id] ?? [], modules: [] })) };
    const assignment = {
      rotationIds: vi.fn(async () => sales),
      members: vi.fn(async () => telecallers.map((t) => ({ ...t, fullName: t.id }))),
      pickNext: vi.fn(async (_tx: unknown, ids: string[]) => (ids[0] ? { id: ids[0], fullName: ids[0] === 'suresh' ? 'Suresh Sales' : 'Kavya Telecaller' } : null)),
    };
    const tx = {
      lead: { update: vi.fn(async (args: { data: Record<string, unknown> }) => updates.push(args)) },
      followUp: { updateMany: vi.fn(async (args: unknown) => followUps.push(args)) },
      leadActivity: { create: vi.fn(async ({ data }: { data: { type: string; message: string } }) => activities.push(data)) },
      user: { findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, fullName: 'Tara Telecaller' })) },
    };
    return { service: new LeadOwnershipService(accessControl as never, assignment as never), tx, updates, activities, followUps };
  }

  it("Tara moves her lead straight to Quote Shared: it's handed to sales, her callbacks close, she keeps the credit", async () => {
    const { service, tx, updates, activities, followUps } = setup();
    const lead = { id: 'l1', assignedToId: 'tara', assignedTo: { fullName: 'Tara Telecaller' }, telecallerId: null, qualifiedAt: null };
    const plan = await service.plan(lead, QUOTE_SHARED);
    expect(plan.move).toBe('handover');
    const done = await service.apply(tx as never, plan, lead, actor, 'Quote Shared');
    expect(done).toEqual({ kind: 'handover', to: { id: 'suresh', fullName: 'Suresh Sales' }, roundRobin: true });
    expect(updates[0].data).toMatchObject({ assignedToId: 'suresh', qualifiedById: 'tara', telecallerId: 'tara' });
    expect(updates[0].data.qualifiedAt).toBeInstanceOf(Date);
    expect(followUps).toHaveLength(1);
    expect(activities[0]).toMatchObject({ type: 'HANDED_OVER', message: 'Moved to Quote Shared: handed to Suresh Sales (round-robin)' });
  });

  it('no salesperson switched on: the move is refused before anything changes', async () => {
    const { service, updates } = setup({ sales: [] });
    const lead = { id: 'l1', assignedToId: 'tara', assignedTo: null, telecallerId: null, qualifiedAt: null };
    await expect(service.plan(lead, DETAILS_SHARED)).rejects.toBeInstanceOf(BadRequestException);
    expect(updates).toHaveLength(0);
  });

  it('moved back to Interested: returns to the telecaller who worked it', async () => {
    const { service, tx, updates, activities } = setup();
    const lead = { id: 'l1', assignedToId: 'suresh', assignedTo: { fullName: 'Suresh Sales' }, telecallerId: 'tara', qualifiedAt: new Date() };
    const plan = await service.plan(lead, INTERESTED);
    expect(plan).toMatchObject({ move: 'return', preferredTelecallerId: 'tara' });
    const done = await service.apply(tx as never, plan, lead, actor, 'Interested');
    expect(done).toMatchObject({ kind: 'return', to: { id: 'tara' }, roundRobin: false });
    expect(updates[0].data).toMatchObject({ assignedToId: 'tara', telecallerId: 'tara', autoAssigned: false });
    expect(activities[0].message).toBe('Moved back to Interested: returned to Tara Telecaller');
  });

  it("if that telecaller is switched off (on leave), the next one in turn gets it; with nobody on, it's refused", async () => {
    const off = setup({ telecallers: [{ id: 'tara', autoAssignEnabled: false }, { id: 'kavya', autoAssignEnabled: true }] });
    const lead = { id: 'l1', assignedToId: 'suresh', assignedTo: null, telecallerId: 'tara', qualifiedAt: new Date() };
    const plan = await off.service.plan(lead, NEW);
    expect(plan.preferredTelecallerId).toBeNull();
    expect(await off.service.apply(off.tx as never, plan, lead, actor, 'New')).toMatchObject({ to: { id: 'kavya' }, roundRobin: true });

    const nobody = setup({ telecallers: [{ id: 'tara', autoAssignEnabled: false }] });
    await expect(nobody.service.plan(lead, NEW)).rejects.toThrow(/no telecaller is switched on/);
  });

  it('closing as Lost or moving within a side changes no owner', async () => {
    const { service, tx, updates } = setup();
    const telecallerLead = { id: 'l1', assignedToId: 'tara', assignedTo: null, telecallerId: 'tara', qualifiedAt: null };
    for (const target of [LOST, INTERESTED, NEW]) {
      const plan = await service.plan(telecallerLead, target);
      expect(plan.move).toBe('none');
      expect(await service.apply(tx as never, plan, telecallerLead, actor, 'x')).toBeNull();
    }
    const salesLead = { ...telecallerLead, assignedToId: 'suresh', qualifiedAt: new Date() };
    for (const target of [QUOTE_SHARED, WON, LOST]) expect((await service.plan(salesLead, target)).move).toBe('none');
    expect(updates).toHaveLength(0);
  });
});
