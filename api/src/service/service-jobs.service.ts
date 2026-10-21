import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { formatOrderNumber } from '../finance/finance-utils.js';
import {
  InstallationStatus,
  Prisma,
  ServiceJobPriority,
  ServiceJobStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CompleteServiceFollowUpDto,
  CreateServiceFollowUpDto,
  CreateServiceJobDto,
  ListServiceFollowUpsQueryDto,
  ListServiceJobsQueryDto,
  UpdateServiceFollowUpDto,
  UpdateServiceJobDto,
} from './dto/service.dto.js';

/**
 * Which service jobs a user may see or touch (tags, not role names):
 *   service.read_all -> every job
 *   otherwise        -> jobs for customers they sold to, or jobs assigned to them
 */
export function serviceScope(user: AuthenticatedUser): Prisma.ServiceJobWhereInput {
  if (user.permissions.includes(PERMISSIONS.SERVICE_READ_ALL)) return {};
  return {
    OR: [
      { installation: { salesOrder: { salespersonId: user.id } } },
      { assignedToId: user.id },
    ],
  };
}

export const formatJobNumber = (n: number) => `SJ-${String(n).padStart(4, '0')}`;

const PRIORITY_RANK: Record<ServiceJobPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const JOB_SELECT = {
  id: true,
  jobNumber: true,
  type: true,
  priority: true,
  status: true,
  description: true,
  resolvedAt: true,
  resolutionNotes: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  installation: {
    select: {
      id: true,
      siteAddress: true,
      completedAt: true,
      salesOrder: {
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          product: { select: { name: true } },
          lead: { select: { phone: true } },
          salesperson: { select: { id: true, fullName: true } },
        },
      },
    },
  },
} satisfies Prisma.ServiceJobSelect;

type JobRow = Prisma.ServiceJobGetPayload<{ select: typeof JOB_SELECT }>;

function serializeJob(job: JobRow) {
  const { installation, ...rest } = job;
  const order = installation.salesOrder;
  return {
    ...rest,
    jobNumberLabel: formatJobNumber(job.jobNumber),
    customer: {
      name: order.customerName,
      phone: order.lead.phone,
      siteAddress: installation.siteAddress,
      product: order.product.name,
      salesperson: order.salesperson,
    },
    installation: { id: installation.id, completedAt: installation.completedAt },
    salesOrder: { id: order.id, orderNumberLabel: formatOrderNumber(order.orderNumber) },
  };
}

const FOLLOW_UP_SELECT = {
  id: true,
  scheduledAt: true,
  note: true,
  outcome: true,
  completedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ServiceFollowUpSelect;

const FOLLOW_UP_WITH_JOB_SELECT = {
  ...FOLLOW_UP_SELECT,
  serviceJob: {
    select: {
      id: true,
      jobNumber: true,
      type: true,
      priority: true,
      status: true,
      assignedTo: { select: { id: true, fullName: true } },
      installation: {
        select: { salesOrder: { select: { customerName: true, lead: { select: { phone: true } } } } },
      },
    },
  },
} satisfies Prisma.ServiceFollowUpSelect;

type FollowUpWithJobRow = Prisma.ServiceFollowUpGetPayload<{ select: typeof FOLLOW_UP_WITH_JOB_SELECT }>;

function serializeFollowUpWithJob(f: FollowUpWithJobRow) {
  const { serviceJob, ...rest } = f;
  const { installation, ...job } = serviceJob;
  return {
    ...rest,
    serviceJob: {
      ...job,
      jobNumberLabel: formatJobNumber(job.jobNumber),
      customerName: installation.salesOrder.customerName,
      phone: installation.salesOrder.lead.phone,
    },
  };
}

@Injectable()
export class ServiceJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async list(user: AuthenticatedUser, query: ListServiceJobsQueryDto) {
    const jobs = await this.prisma.serviceJob.findMany({
      where: {
        AND: [
          serviceScope(user),
          {
            status: query.status,
            type: query.type,
            priority: query.priority,
            assignedToId: query.assignedTo === 'me' ? user.id : undefined,
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        ...JOB_SELECT,
        followUps: {
          where: { completedAt: null },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
          select: { scheduledAt: true },
        },
      },
    });
    // Unresolved first, most urgent first, then newest.
    const statusRank = (s: ServiceJobStatus) => (s === 'RESOLVED' ? 1 : 0);
    return jobs
      .sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .map(({ followUps, ...job }) => ({
        ...serializeJob(job),
        nextFollowUpAt: followUps[0]?.scheduledAt ?? null,
      }));
  }

  async summary(user: AuthenticatedUser) {
    const scope = serviceScope(user);
    const now = new Date();
    const [open, inProgress, urgentOrHigh, overdueFollowUps, upcomingFollowUps] = await this.prisma.$transaction([
      this.prisma.serviceJob.count({ where: { AND: [scope, { status: 'OPEN' }] } }),
      this.prisma.serviceJob.count({ where: { AND: [scope, { status: 'IN_PROGRESS' }] } }),
      this.prisma.serviceJob.count({
        where: { AND: [scope, { status: { not: 'RESOLVED' }, priority: { in: ['URGENT', 'HIGH'] } }] },
      }),
      this.prisma.serviceFollowUp.count({
        where: { completedAt: null, scheduledAt: { lt: now }, serviceJob: scope },
      }),
      this.prisma.serviceFollowUp.count({
        where: { completedAt: null, scheduledAt: { gte: now }, serviceJob: scope },
      }),
    ]);
    return { open, inProgress, urgentOrHigh, overdueFollowUps, upcomingFollowUps };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const job = await this.prisma.serviceJob.findFirst({
      where: { AND: [{ id }, serviceScope(user)] },
      select: {
        ...JOB_SELECT,
        followUps: { orderBy: { scheduledAt: 'desc' }, select: FOLLOW_UP_SELECT },
      },
    });
    if (!job) throw new NotFoundException('Service job not found');
    const { followUps, ...rest } = job;
    return { ...serializeJob(rest), followUps };
  }

  /**
   * Completed installations the user can raise a job against: all of them with
   * service.read_all, otherwise only customers they sold to.
   */
  async eligibleInstallations(user: AuthenticatedUser) {
    const all = user.permissions.includes(PERMISSIONS.SERVICE_READ_ALL);
    const rows = await this.prisma.installation.findMany({
      where: {
        status: InstallationStatus.COMPLETED,
        ...(all ? {} : { salesOrder: { salespersonId: user.id } }),
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        siteAddress: true,
        completedAt: true,
        salesOrder: {
          select: { orderNumber: true, customerName: true, product: { select: { name: true } } },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      siteAddress: r.siteAddress,
      completedAt: r.completedAt,
      customerName: r.salesOrder.customerName,
      product: r.salesOrder.product.name,
      orderNumberLabel: formatOrderNumber(r.salesOrder.orderNumber),
    }));
  }

  /** People who can be assigned service work (hold service.write). */
  assignees() {
    return this.accessControl.activeUsersWithAnyTag([PERMISSIONS.SERVICE_WRITE]);
  }

  async create(user: AuthenticatedUser, dto: CreateServiceJobDto) {
    const eligible = await this.eligibleInstallations(user);
    if (!eligible.some((i) => i.id === dto.installationId)) {
      const exists = await this.prisma.installation.findUnique({
        where: { id: dto.installationId },
        select: { status: true },
      });
      throw exists && exists.status !== InstallationStatus.COMPLETED
        ? new BadRequestException('Service jobs can only be raised after the installation is completed')
        : new NotFoundException('Installation not found');
    }
    if (dto.assignedToId) await this.ensureAssignable(dto.assignedToId);

    const job = await this.prisma.serviceJob.create({
      data: {
        installationId: dto.installationId,
        type: dto.type,
        priority: dto.priority ?? ServiceJobPriority.MEDIUM,
        description: dto.description,
        assignedToId: dto.assignedToId ?? null,
        createdById: user.id,
      },
      select: { id: true },
    });
    return this.findOne(user, job.id);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateServiceJobDto) {
    const existing = await this.getInScope(user, id);
    if (dto.assignedToId) await this.ensureAssignable(dto.assignedToId);

    const data: Prisma.ServiceJobUncheckedUpdateInput = {
      type: dto.type,
      priority: dto.priority,
      description: dto.description,
      assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId,
      resolutionNotes: dto.resolutionNotes,
    };
    if (dto.status && dto.status !== existing.status) {
      data.status = dto.status;
      data.resolvedAt = dto.status === ServiceJobStatus.RESOLVED ? new Date() : null;
    }
    await this.prisma.serviceJob.update({ where: { id }, data });

    const stillVisible = await this.prisma.serviceJob.count({ where: { AND: [{ id }, serviceScope(user)] } });
    return stillVisible ? this.findOne(user, id) : { id, movedOutOfScope: true };
  }

  // --- Follow-ups (#5) -----------------------------------------------------

  async listFollowUps(user: AuthenticatedUser, query: ListServiceFollowUpsQueryDto) {
    const now = new Date();
    const stateFilter: Record<string, Prisma.ServiceFollowUpWhereInput> = {
      pending: { completedAt: null },
      overdue: { completedAt: null, scheduledAt: { lt: now } },
      upcoming: { completedAt: null, scheduledAt: { gte: now } },
      completed: { completedAt: { not: null } },
    };
    const rows = await this.prisma.serviceFollowUp.findMany({
      where: {
        AND: [
          { serviceJob: serviceScope(user) },
          query.assignedTo === 'me' ? { serviceJob: { assignedToId: user.id } } : {},
          query.state ? stateFilter[query.state] : {},
          { scheduledAt: { gte: query.from, lt: query.to } },
        ],
      },
      orderBy: { scheduledAt: query.state === 'completed' ? 'desc' : 'asc' },
      take: 500,
      select: FOLLOW_UP_WITH_JOB_SELECT,
    });
    return rows.map(serializeFollowUpWithJob);
  }

  async createFollowUp(user: AuthenticatedUser, jobId: string, dto: CreateServiceFollowUpDto) {
    await this.getInScope(user, jobId);
    const row = await this.prisma.serviceFollowUp.create({
      data: { serviceJobId: jobId, scheduledAt: dto.scheduledAt, note: dto.note || null, createdById: user.id },
      select: FOLLOW_UP_WITH_JOB_SELECT,
    });
    return serializeFollowUpWithJob(row);
  }

  async updateFollowUp(user: AuthenticatedUser, id: string, dto: UpdateServiceFollowUpDto) {
    await this.ensureFollowUpInScope(user, id);
    const row = await this.prisma.serviceFollowUp.update({
      where: { id },
      data: { scheduledAt: dto.scheduledAt, note: dto.note },
      select: FOLLOW_UP_WITH_JOB_SELECT,
    });
    return serializeFollowUpWithJob(row);
  }

  async completeFollowUp(user: AuthenticatedUser, id: string, dto: CompleteServiceFollowUpDto) {
    await this.ensureFollowUpInScope(user, id);
    const row = await this.prisma.serviceFollowUp.update({
      where: { id },
      data: { outcome: dto.outcome, note: dto.note, completedAt: new Date() },
      select: FOLLOW_UP_WITH_JOB_SELECT,
    });
    return serializeFollowUpWithJob(row);
  }

  async reopenFollowUp(user: AuthenticatedUser, id: string) {
    await this.ensureFollowUpInScope(user, id);
    const row = await this.prisma.serviceFollowUp.update({
      where: { id },
      data: { outcome: null, completedAt: null },
      select: FOLLOW_UP_WITH_JOB_SELECT,
    });
    return serializeFollowUpWithJob(row);
  }

  private async getInScope(user: AuthenticatedUser, id: string) {
    const job = await this.prisma.serviceJob.findFirst({
      where: { AND: [{ id }, serviceScope(user)] },
      select: { id: true, status: true },
    });
    if (!job) throw new NotFoundException('Service job not found');
    return job;
  }

  private async ensureFollowUpInScope(user: AuthenticatedUser, id: string) {
    const found = await this.prisma.serviceFollowUp.count({ where: { id, serviceJob: serviceScope(user) } });
    if (!found) throw new NotFoundException('Service follow-up not found');
  }

  private async ensureAssignable(userId: string) {
    const ok = (await this.assignees()).some((u) => u.id === userId);
    if (!ok) throw new BadRequestException(`Assignee must be active and hold ${PERMISSIONS.SERVICE_WRITE}`);
  }
}

