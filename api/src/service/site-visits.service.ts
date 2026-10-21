import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { dateOnly, formatOrderNumber, parseDateOnly } from '../finance/finance-utils.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateSiteVisitDto,
  CreateSiteVisitTagDto,
  ListSiteVisitsQueryDto,
  UpdateSiteVisitDto,
  UpdateSiteVisitTagDto,
} from './dto/service.dto.js';

const TAG_SELECT = { id: true, name: true, description: true, color: true, isActive: true } satisfies Prisma.SiteVisitTagSelect;

const VISIT_SELECT = {
  id: true,
  visitDate: true,
  customerName: true,
  siteAddress: true,
  purpose: true,
  notes: true,
  createdAt: true,
  person: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  tags: { orderBy: { name: 'asc' }, select: TAG_SELECT },
  installation: {
    select: { id: true, status: true, salesOrder: { select: { orderNumber: true } } },
  },
} satisfies Prisma.SiteVisitSelect;

type VisitRow = Prisma.SiteVisitGetPayload<{ select: typeof VISIT_SELECT }>;

const serializeVisit = (v: VisitRow) => ({
  ...v,
  visitDate: dateOnly(v.visitDate),
  installation: v.installation
    ? {
        id: v.installation.id,
        status: v.installation.status,
        orderNumberLabel: formatOrderNumber(v.installation.salesOrder.orderNumber),
      }
    : null,
});

@Injectable()
export class SiteVisitsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Tags (admin-managed list) -------------------------------------------

  async listTags(includeInactive: boolean) {
    const tags = await this.prisma.siteVisitTag.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { ...TAG_SELECT, _count: { select: { visits: true } } },
    });
    return tags.map(({ _count, ...t }) => ({ ...t, visitCount: _count.visits }));
  }

  async createTag(dto: CreateSiteVisitTagDto) {
    await this.ensureTagNameFree(dto.name);
    return this.prisma.siteVisitTag.create({
      data: { name: dto.name, description: dto.description || null, color: dto.color ?? 'slate' },
      select: TAG_SELECT,
    });
  }

  async updateTag(id: string, dto: UpdateSiteVisitTagDto) {
    await this.ensureTag(id);
    if (dto.name) await this.ensureTagNameFree(dto.name, id);
    return this.prisma.siteVisitTag.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description === undefined ? undefined : dto.description || null,
        color: dto.color,
        isActive: dto.isActive,
      },
      select: TAG_SELECT,
    });
  }

  /** Unused tags are deleted; tags already on visits must be retired instead. */
  async deleteTag(id: string) {
    await this.ensureTag(id);
    const used = await this.prisma.siteVisit.count({ where: { tags: { some: { id } } } });
    if (used > 0) {
      throw new ConflictException(`Tag is on ${used} visit(s); retire it (isActive=false) instead of deleting`);
    }
    await this.prisma.siteVisitTag.delete({ where: { id } });
  }

  // --- Visits ----------------------------------------------------------------

  async list(query: ListSiteVisitsQueryDto) {
    const visits = await this.prisma.siteVisit.findMany({
      where: {
        personId: query.personId,
        tags: query.tagId ? { some: { id: query.tagId } } : undefined,
        visitDate: {
          gte: query.from ? parseDateOnly(query.from) : undefined,
          lte: query.to ? parseDateOnly(query.to) : undefined,
        },
      },
      orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      select: VISIT_SELECT,
    });
    return visits.map(serializeVisit);
  }

  async findOne(id: string) {
    const visit = await this.prisma.siteVisit.findUnique({ where: { id }, select: VISIT_SELECT });
    if (!visit) throw new NotFoundException('Site visit not found');
    return serializeVisit(visit);
  }

  async create(user: AuthenticatedUser, dto: CreateSiteVisitDto) {
    const personId = dto.personId ?? user.id;
    await this.ensureActiveUser(personId);
    await this.ensureTagsUsable(dto.tagIds, []);
    if (dto.installationId) await this.ensureInstallation(dto.installationId);

    const visit = await this.prisma.siteVisit.create({
      data: {
        visitDate: parseDateOnly(dto.visitDate),
        personId,
        customerName: dto.customerName,
        siteAddress: dto.siteAddress,
        purpose: dto.purpose,
        notes: dto.notes || null,
        installationId: dto.installationId ?? null,
        tags: { connect: dto.tagIds.map((id) => ({ id })) },
        createdById: user.id,
      },
      select: { id: true },
    });
    return this.findOne(visit.id);
  }

  async update(id: string, dto: UpdateSiteVisitDto) {
    const existing = await this.prisma.siteVisit.findUnique({
      where: { id },
      select: { tags: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('Site visit not found');
    if (dto.personId) await this.ensureActiveUser(dto.personId);
    if (dto.installationId) await this.ensureInstallation(dto.installationId);
    if (dto.tagIds) {
      // Retired tags may stay on a visit that already had them, but can't be newly added.
      await this.ensureTagsUsable(dto.tagIds, existing.tags.map((t) => t.id));
    }

    await this.prisma.siteVisit.update({
      where: { id },
      data: {
        visitDate: dto.visitDate ? parseDateOnly(dto.visitDate) : undefined,
        personId: dto.personId,
        customerName: dto.customerName,
        siteAddress: dto.siteAddress,
        purpose: dto.purpose,
        notes: dto.notes === undefined ? undefined : dto.notes || null,
        installationId: dto.installationId === undefined ? undefined : dto.installationId,
        tags: dto.tagIds ? { set: dto.tagIds.map((tagId) => ({ id: tagId })) } : undefined,
      },
    });
    return this.findOne(id);
  }

  /** Anyone active can be recorded as the visitor (sales, supervisor, technician…). */
  people() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, role: { select: { name: true } } },
    });
  }

  private async ensureTagsUsable(tagIds: string[], alreadyOnVisit: string[]) {
    if (tagIds.length === 0) return;
    const tags = await this.prisma.siteVisitTag.findMany({
      where: { id: { in: tagIds } },
      select: { id: true, name: true, isActive: true },
    });
    if (tags.length !== tagIds.length) throw new BadRequestException('Unknown site-visit tag');
    const retired = tags.filter((t) => !t.isActive && !alreadyOnVisit.includes(t.id));
    if (retired.length > 0) {
      throw new BadRequestException(`Retired tag(s) can't be added: ${retired.map((t) => t.name).join(', ')}`);
    }
  }

  private async ensureTag(id: string) {
    const found = await this.prisma.siteVisitTag.count({ where: { id } });
    if (!found) throw new NotFoundException('Site-visit tag not found');
  }

  private async ensureTagNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.siteVisitTag.findUnique({ where: { name }, select: { id: true } });
    if (clash && clash.id !== exceptId) throw new ConflictException(`A tag named "${name}" already exists`);
  }

  private async ensureActiveUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { isActive: true } });
    if (!user?.isActive) throw new BadRequestException('Person not found or inactive');
  }

  private async ensureInstallation(id: string) {
    const found = await this.prisma.installation.count({ where: { id } });
    if (!found) throw new BadRequestException('Installation not found');
  }
}
