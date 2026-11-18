import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { LeadActionsService } from './lead-actions.service.js';

const user = (id: string, permissions: string[]): AuthenticatedUser => ({
  id,
  email: `${id}@x.in`,
  fullName: id === 'admin' ? 'Precon Admin' : 'Tara Telecaller',
  role: { key: id, name: id },
  permissions,
  modules: [],
  token: { jti: 'j', expiresAt: new Date() },
});

function setup() {
  const activities: { message: string; userId: string; changes: unknown }[] = [];
  const updates: unknown[] = [];
  const notifications: { userId: string; type?: string; title?: string; body?: string }[] = [];
  const db = {
    lead: {
      findFirst: vi.fn(async () => ({
        id: 'lead-1', name: 'Ravi', status: 'QUALIFIED', qualifiedAt: new Date(), telecallerId: 'tele', assignedToId: 's1', assignedTo: { fullName: 'Suresh' },
      })),
      update: vi.fn(async (args: unknown) => updates.push(args)),
    },
    leadActivity: { create: vi.fn(async ({ data }: { data: { message: string; userId: string; changes: unknown } }) => activities.push(data)) },
    notification: { create: vi.fn(async ({ data }: { data: { userId: string } }) => notifications.push(data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  const assignment = { members: vi.fn(async () => [{ id: 's1', fullName: 'Suresh' }, { id: 's2', fullName: 'Meena' }]) };
  return { service: new LeadActionsService(db as never, assignment as never, {} as never), activities, updates, notifications };
}

describe('reassigning a lead to a different salesperson', () => {
  it('is admin only: the telecaller who handled it can no longer do it', async () => {
    const { service, updates } = setup();
    await expect(service.changeSalesperson(user('tele', ['leads.read', 'leads.qualify']), 'lead-1', 's2')).rejects.toBeInstanceOf(ForbiddenException);
    expect(updates).toHaveLength(0);
  });

  it('moves the lead, tells the new salesperson, and records who, from whom, to whom', async () => {
    const { service, activities, updates, notifications } = setup();
    const result = await service.changeSalesperson(user('admin', ['leads.read', 'leads.read_all', 'leads.assign']), 'lead-1', 's2');
    expect(result.salesperson).toEqual({ id: 's2', fullName: 'Meena' });
    expect(updates).toEqual([{ where: { id: 'lead-1' }, data: { assignedToId: 's2', autoAssigned: false } }]);
    expect(activities[0]).toMatchObject({
      userId: 'admin',
      message: 'Reassigned by Precon Admin: Suresh → Meena',
      changes: [{ field: 'assignedTo', label: 'Salesperson', from: 'Suresh', to: 'Meena' }],
    });
    expect(notifications).toEqual([expect.objectContaining({ userId: 's2', type: 'LEAD_ASSIGNED', title: 'New lead: Ravi', body: 'Reassigned to you by Precon Admin (was Suresh)' })]);
  });
});
