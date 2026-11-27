import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaClient | Prisma.TransactionClient;
const STEP = 10;

export const CONSTRUCTION_SELECT = { id: true, key: true, name: true, position: true, isActive: true } satisfies Prisma.ConstructionStageSelect;

/** Shown for a lead with no construction stage; not a row, so it can't be renamed or deleted. */
export const NOT_KNOWN = 'Not known';

/**
 * Where the customer's building is (Planning, Foundation, Plinth Beam, ...), a
 * second label on a lead, independent of its lead status. Admin-managed: add,
 * rename, reorder, switch on/off, delete when empty. "Not known" (no stage) is
 * always first. Changing a lead's construction stage never changes who has it.
 */
@Injectable()
export class ConstructionStagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All stages in order (switched-off ones too), with how many leads each holds. */
  async list() {
    const [stages, counts, notKnown] = await Promise.all([
      this.all(),
      this.prisma.lead.groupBy({ by: ['constructionStageId'], where: { constructionStageId: { not: null } }, orderBy: { constructionStageId: 'asc' }, _count: { _all: true } }),
      this.prisma.lead.count({ where: { constructionStageId: null } }),
    ]);
    const leadsIn = (id: string) => (counts.find((c) => c.constructionStageId === id)?._count as { _all: number } | undefined)?._all ?? 0;
    return { notKnown: { name: NOT_KNOWN, leads: notKnown }, stages: stages.map((s) => ({ ...s, leads: leadsIn(s.id) })) };
  }

  all(db: Db = this.prisma) {
    return db.constructionStage.findMany({ orderBy: { position: 'asc' }, select: CONSTRUCTION_SELECT });
  }

  async get(id: string, db: Db = this.prisma) {
    const stage = await db.constructionStage.findUnique({ where: { id }, select: CONSTRUCTION_SELECT });
    if (!stage) throw new NotFoundException('Construction stage not found');
    return stage;
  }

  /** A stage a lead can be put in: it must exist and be switched on (null = Not known is always fine). */
  async usable(id: string | null) {
    if (id === null) return null;
    const stage = await this.get(id).catch(() => {
      throw new BadRequestException('That construction stage does not exist');
    });
    if (!stage.isActive) throw new BadRequestException(`"${stage.name}" is switched off; pick another construction stage`);
    return stage;
  }

  /** Add a stage after `afterId` (or at the end). */
  async create(name: string, afterId?: string) {
    await this.ensureNameFree(name);
    return this.prisma.$transaction(async (tx) => {
      const all = await this.all(tx);
      let index = all.length;
      if (afterId) {
        const at = all.findIndex((s) => s.id === afterId);
        if (at === -1) throw new BadRequestException('That construction stage does not exist');
        index = at + 1;
      }
      const created = await tx.constructionStage.create({ data: { key: await this.freshKey(name, tx), name, position: 0 }, select: CONSTRUCTION_SELECT });
      const order = all.map((s) => s.id);
      order.splice(index, 0, created.id);
      await this.applyOrder(order, tx);
      return this.get(created.id, tx);
    });
  }

  async rename(id: string, name: string) {
    const stage = await this.get(id);
    if (stage.name === name) return stage;
    if (name.trim().toLowerCase() === NOT_KNOWN.toLowerCase()) throw new BadRequestException(`"${NOT_KNOWN}" is kept for leads with no construction stage`);
    await this.ensureNameFree(name, id);
    return this.prisma.constructionStage.update({ where: { id }, data: { name }, select: CONSTRUCTION_SELECT });
  }

  async setActive(id: string, isActive: boolean) {
    await this.get(id);
    return this.prisma.constructionStage.update({ where: { id }, data: { isActive }, select: CONSTRUCTION_SELECT });
  }

  /** New order: every stage exactly once. */
  async reorder(ids: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const current = new Set((await this.all(tx)).map((s) => s.id));
      if (ids.length !== current.size || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
        throw new BadRequestException('Send every construction stage exactly once, in the new order');
      }
      await this.applyOrder(ids, tx);
      return this.all(tx);
    });
  }

  /** Only an empty stage can be deleted; otherwise switch it off (its leads keep it). */
  async delete(id: string) {
    const stage = await this.get(id);
    const leads = await this.prisma.lead.count({ where: { constructionStageId: id } });
    if (leads > 0) {
      throw new ConflictException(
        `"${stage.name}" has ${leads} lead${leads === 1 ? '' : 's'}, so it can't be deleted. Switch it off instead: it leaves the picker and its leads keep it.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.constructionStage.delete({ where: { id } });
      await this.applyOrder((await this.all(tx)).map((s) => s.id), tx);
    });
  }

  private async applyOrder(ids: string[], db: Prisma.TransactionClient) {
    for (const [i, id] of ids.entries()) await db.constructionStage.update({ where: { id }, data: { position: (i + 1) * STEP } });
  }

  private async ensureNameFree(name: string, exceptId?: string) {
    if (name.trim().toLowerCase() === NOT_KNOWN.toLowerCase()) throw new BadRequestException(`"${NOT_KNOWN}" is kept for leads with no construction stage`);
    const clash = await this.prisma.constructionStage.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, id: exceptId ? { not: exceptId } : undefined },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`There is already a construction stage called "${name}"`);
  }

  private async freshKey(name: string, db: Db) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'stage';
    let key = base;
    for (let n = 2; await db.constructionStage.findUnique({ where: { key }, select: { id: true } }); n += 1) key = `${base}-${n}`;
    return key;
  }
}
