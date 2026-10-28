/**
 * Writing lead notifications from wherever leads change hands. Takes the
 * Prisma client or a transaction, so the notification commits with the change.
 * Nobody is notified about something they did themselves.
 */
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

type Db = PrismaClient | Prisma.TransactionClient;

export async function notifyLeadAssigned(
  db: Db,
  args: { userId: string; leadId: string; leadName: string; actorId?: string | null; how: string },
) {
  if (args.actorId && args.actorId === args.userId) return;
  await db.notification.create({
    data: { userId: args.userId, type: 'LEAD_ASSIGNED', leadId: args.leadId, title: `New lead: ${args.leadName}`, body: args.how },
  });
}

export async function notifyLeadHandedOver(
  db: Db,
  args: { userId: string; leadId: string; leadName: string; fromName: string; actorId: string },
) {
  if (args.actorId === args.userId) return;
  await db.notification.create({
    data: {
      userId: args.userId,
      type: 'LEAD_HANDED_OVER',
      leadId: args.leadId,
      title: `Qualified lead from ${args.fromName}: ${args.leadName}`,
      body: 'Handed over to you. Call to quote.',
    },
  });
}
