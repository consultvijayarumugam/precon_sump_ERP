import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const STAGE_SELECT = {
  id: true,
  key: true,
  name: true,
  kind: true,
  phase: true,
  isHandover: true,
  position: true,
  isActive: true,
} satisfies Prisma.PipelineStageSelect;

export type Stage = Prisma.PipelineStageGetPayload<{ select: typeof STAGE_SELECT }>;

/** Gap between middle-stage positions, so a new stage can slot in anywhere. */
const STEP = 10;

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Admin-managed pipeline stages.
 *
 *   New (entry), Won and Lost (terminal) are protected: they can't be renamed,
 *   moved, switched off or deleted, because logic depends on them.
 *   Middle stages can be added, renamed, reordered (only between New and the
 *   outcomes) and switched off. The handover stage (where telecallers qualify
 *   leads for sales) can be renamed and moved but never switched off or deleted.
 *
 * Each stage counts as a fixed phase (LeadStatus) that the rest of the app runs
 * on: middle stages before the handover stage are CONTACTED (telecaller side),
 * the handover stage is QUALIFIED, those after it are QUOTED (sales side).
 * Reordering recomputes phases and the leads in moved stages follow.
 */
@Injectable()
export class StagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All stages in pipeline order (inactive ones too), with how many leads each holds. */
  async list() {
    const [stages, counts] = await Promise.all([
      this.prisma.pipelineStage.findMany({ orderBy: { position: 'asc' }, select: STAGE_SELECT }),
      this.prisma.lead.groupBy({ by: ['stageId'], _count: { _all: true } }),
    ]);
    return stages.map((s) => ({ ...s, leads: counts.find((c) => c.stageId === s.id)?._count._all ?? 0 }));
  }

  all(db: Db = this.prisma) {
    return db.pipelineStage.findMany({ orderBy: { position: 'asc' }, select: STAGE_SELECT });
  }

  async get(id: string, db: Db = this.prisma) {
    const stage = await db.pipelineStage.findUnique({ where: { id }, select: STAGE_SELECT });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  /** The stage telecallers hand leads to sales into (identity, not label). */
  async handover(db: Db = this.prisma) {
    const stage = await db.pipelineStage.findFirst({ where: { isHandover: true }, select: STAGE_SELECT });
    if (!stage) throw new BadRequestException('No handover stage is set up; ask an admin to check Pipeline stages');
    return stage;
  }

  /** Where a lead goes on its first call: the first active telecaller-side stage, if there is one. */
  firstTelecallerStage(db: Db = this.prisma) {
    return db.pipelineStage.findFirst({
      where: { kind: 'MIDDLE', phase: 'CONTACTED', isActive: true },
      orderBy: { position: 'asc' },
      select: STAGE_SELECT,
    });
  }

  byKind(kind: 'ENTRY' | 'WON' | 'LOST', db: Db = this.prisma) {
    return db.pipelineStage.findFirstOrThrow({ where: { kind }, select: STAGE_SELECT });
  }

  /**
   * The stage for a status sent the old way (PATCH {status}): the stage named
   * after it if it still exists and is active, else the first active stage of
   * that phase, else any stage of that phase.
   */
  async forStatus(status: LeadStatus, db: Db = this.prisma) {
    const candidates = await db.pipelineStage.findMany({ where: { phase: status }, orderBy: { position: 'asc' }, select: STAGE_SELECT });
    const stage =
      candidates.find((s) => s.key === status && s.isActive) ?? candidates.find((s) => s.isActive) ?? candidates[0];
    if (!stage) throw new BadRequestException(`No pipeline stage for "${status}"`);
    return stage;
  }

  // --- Admin changes ------------------------------------------------------------------

  /** Add a middle stage, right after `afterStageId` (New or a middle stage); default: before the outcomes. */
  async create(name: string, afterStageId?: string) {
    await this.ensureNameFree(name);
    return this.prisma.$transaction(async (tx) => {
      const middle = await this.middle(tx);
      let index = middle.length; // at the end of the middle
      if (afterStageId) {
        const after = await this.get(afterStageId, tx);
        if (after.kind === 'WON' || after.kind === 'LOST') throw new BadRequestException('New stages go before Won and Lost');
        index = after.kind === 'ENTRY' ? 0 : middle.findIndex((s) => s.id === after.id) + 1;
      }
      const created = await tx.pipelineStage.create({
        data: { key: await this.freshKey(name, tx), name, kind: 'MIDDLE', phase: 'QUOTED', position: 0 },
        select: STAGE_SELECT,
      });
      const order = middle.map((s) => s.id);
      order.splice(index, 0, created.id);
      await this.applyOrder(order, tx);
      return this.get(created.id, tx);
    });
  }

  async rename(id: string, name: string) {
    const stage = await this.get(id);
    if (stage.kind !== 'MIDDLE') throw new BadRequestException(`"${stage.name}" is a protected stage and can't be renamed`);
    if (stage.name === name) return stage;
    await this.ensureNameFree(name, id);
    return this.prisma.pipelineStage.update({ where: { id }, data: { name }, select: STAGE_SELECT });
  }

  async setActive(id: string, isActive: boolean) {
    const stage = await this.get(id);
    if (stage.kind !== 'MIDDLE') throw new BadRequestException(`"${stage.name}" is a protected stage and is always on`);
    if (stage.isHandover && !isActive) {
      throw new BadRequestException(`"${stage.name}" is where telecallers hand leads to sales, so it can't be switched off`);
    }
    return this.prisma.pipelineStage.update({ where: { id }, data: { isActive }, select: STAGE_SELECT });
  }

  /** New order for the middle stages: exactly the current middle stages, each once. */
  async reorder(ids: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const middle = await this.middle(tx);
      const current = new Set(middle.map((s) => s.id));
      if (ids.length !== current.size || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
        throw new BadRequestException('Send every middle stage exactly once. New stays first; Won and Lost stay last.');
      }
      await this.applyOrder(ids, tx);
      return this.all(tx);
    });
  }

  /** Only an empty, non-handover middle stage can be deleted; otherwise switch it off. */
  async delete(id: string) {
    const stage = await this.get(id);
    if (stage.kind !== 'MIDDLE') throw new BadRequestException(`"${stage.name}" is a protected stage and can't be deleted`);
    if (stage.isHandover) throw new BadRequestException(`"${stage.name}" is where telecallers hand leads to sales, so it can't be deleted`);
    const leads = await this.prisma.lead.count({ where: { stageId: id } });
    if (leads > 0) {
      throw new ConflictException(
        `"${stage.name}" has ${leads} lead${leads === 1 ? '' : 's'}, so it can't be deleted. Switch it off instead: it disappears from the stage picker and its leads and history stay as they are.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.pipelineStage.delete({ where: { id } });
      await this.applyOrder((await this.middle(tx)).map((s) => s.id), tx);
    });
  }

  // --- Internals ------------------------------------------------------------------------

  private middle(db: Db) {
    return db.pipelineStage.findMany({ where: { kind: 'MIDDLE' }, orderBy: { position: 'asc' }, select: STAGE_SELECT });
  }

  /**
   * Renumbers the middle (10, 20, ...) in the given order and recomputes each
   * stage's phase from where it sits relative to the handover stage. Leads in
   * a stage whose phase changed take the new phase, so logic stays consistent.
   */
  private async applyOrder(ids: string[], db: Prisma.TransactionClient) {
    const stages = await db.pipelineStage.findMany({ where: { id: { in: ids } }, select: STAGE_SELECT });
    const handoverAt = ids.findIndex((id) => stages.find((s) => s.id === id)?.isHandover);
    for (const [i, id] of ids.entries()) {
      const stage = stages.find((s) => s.id === id)!;
      const phase: LeadStatus = handoverAt === -1 || i > handoverAt ? 'QUOTED' : i === handoverAt ? 'QUALIFIED' : 'CONTACTED';
      await db.pipelineStage.update({ where: { id }, data: { position: (i + 1) * STEP, phase } });
      if (phase !== stage.phase) {
        // The trigger sees the stage's new phase matches, so the leads stay in this stage.
        await db.lead.updateMany({ where: { stageId: id }, data: { status: phase } });
      }
    }
  }

  private async ensureNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.pipelineStage.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, id: exceptId ? { not: exceptId } : undefined },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`There is already a stage called "${name}"`);
  }

  private async freshKey(name: string, db: Db) {
    const base = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'stage'}`;
    let key = base;
    for (let n = 2; await db.pipelineStage.findUnique({ where: { key }, select: { id: true } }); n += 1) key = `${base}-${n}`;
    return key;
  }
}
