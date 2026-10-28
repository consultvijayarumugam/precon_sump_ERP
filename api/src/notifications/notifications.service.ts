import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { businessPeriods } from '../workflow/business-periods.js';

const ITEM_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  readAt: true,
  createdAt: true,
  lead: { select: { id: true, name: true, phone: true } },
  followUp: { select: { id: true, scheduledAt: true, note: true } },
} satisfies Prisma.NotificationSelect;

/**
 * The bell. Two kinds of items:
 *   - updates (LEAD_ASSIGNED, LEAD_HANDED_OVER): written when they happen;
 *   - reminders (FOLLOW_UP_DUE): one per callback/follow-up on your leads that
 *     is due today or overdue, created when you check (no scheduler needed)
 *     and dropped automatically once the follow-up is done or the lead moves on.
 * Everything is in-app only; WhatsApp/email delivery is a later add-on.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    await this.createReminders(user);
    const now = new Date();
    const live = this.liveFor(user.id);
    const [reminders, updates, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { AND: [live, { type: 'FOLLOW_UP_DUE' }] },
        orderBy: { followUp: { scheduledAt: 'asc' } },
        take: 50,
        select: ITEM_SELECT,
      }),
      this.prisma.notification.findMany({
        where: { userId: user.id, type: { not: 'FOLLOW_UP_DUE' } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: ITEM_SELECT,
      }),
      this.prisma.notification.count({ where: { AND: [live, { readAt: null }] } }),
    ]);
    return {
      unread,
      reminders: reminders.map((r) => ({ ...r, overdue: Boolean(r.followUp && r.followUp.scheduledAt < now) })),
      updates,
    };
  }

  /** The daily "my reminders" card: what's overdue, what's due today, what's new today. */
  async summary(user: AuthenticatedUser) {
    const p = businessPeriods();
    const followUps = user.permissions.includes(PERMISSIONS.LEADS_READ)
      ? await this.prisma.followUp.findMany({
          where: { completedAt: null, scheduledAt: { lt: p.todayEnd }, lead: { assignedToId: user.id } },
          orderBy: { scheduledAt: 'asc' },
          take: 100,
          select: { id: true, scheduledAt: true, note: true, lead: { select: { id: true, name: true, phone: true } } },
        })
      : [];
    const [assignedToday, handedToday] = await Promise.all([
      this.prisma.notification.count({ where: { userId: user.id, type: 'LEAD_ASSIGNED', createdAt: { gte: p.todayStart } } }),
      this.prisma.notification.count({ where: { userId: user.id, type: 'LEAD_HANDED_OVER', createdAt: { gte: p.todayStart } } }),
    ]);
    return {
      overdue: followUps.filter((f) => f.scheduledAt < p.now),
      dueToday: followUps.filter((f) => f.scheduledAt >= p.now),
      assignedToday,
      handedToday,
    };
  }

  async markRead(user: AuthenticatedUser, id: string) {
    const found = await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    if (found.count === 0 && !(await this.prisma.notification.count({ where: { id, userId: user.id } }))) {
      throw new NotFoundException('Notification not found');
    }
    return { id, read: true };
  }

  async markAllRead(user: AuthenticatedUser) {
    const res = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { marked: res.count };
  }

  /** One reminder per open callback/follow-up on your leads that's due by the end of today. */
  private async createReminders(user: AuthenticatedUser) {
    if (!user.permissions.includes(PERMISSIONS.LEADS_READ)) return;
    const { todayEnd } = businessPeriods();
    const due = await this.prisma.followUp.findMany({
      where: { completedAt: null, scheduledAt: { lt: todayEnd }, lead: { assignedToId: user.id }, notifications: { none: { userId: user.id } } },
      take: 200,
      select: { id: true, note: true, lead: { select: { id: true, name: true } } },
    });
    if (due.length === 0) return;
    await this.prisma.notification.createMany({
      data: due.map((f) => ({
        userId: user.id,
        type: 'FOLLOW_UP_DUE' as const,
        leadId: f.lead.id,
        followUpId: f.id,
        title: `Call ${f.lead.name}`,
        body: f.note,
      })),
      skipDuplicates: true,
    });
  }

  /** Updates, plus reminders whose follow-up is still open on a lead that's still yours. */
  private liveFor(userId: string): Prisma.NotificationWhereInput {
    return {
      userId,
      OR: [{ type: { not: 'FOLLOW_UP_DUE' } }, { followUp: { completedAt: null, lead: { assignedToId: userId } } }],
    };
  }
}
