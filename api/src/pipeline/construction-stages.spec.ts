import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConstructionStagesService, NOT_KNOWN } from './construction-stages.service.js';

type Row = { id: string; key: string; name: string; position: number; isActive: boolean };

function setup(rows: Row[], leadsIn: Record<string, number> = {}) {
  const db = {
    constructionStage: {
      findMany: vi.fn(async () => [...rows].sort((a, b) => a.position - b.position)),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; key?: string } }) => rows.find((r) => (where.id ? r.id === where.id : r.key === where.key)) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { name: { equals: string }; id?: { not: string } } }) =>
        rows.find((r) => r.name.toLowerCase() === where.name.equals.toLowerCase() && r.id !== where.id?.not) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'isActive'> }) => {
        const row = { ...data, id: `id-${data.key}`, isActive: true };
        rows.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.find((r) => r.id === where.id)!, data)),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => rows.splice(rows.findIndex((r) => r.id === where.id), 1)),
    },
    lead: { count: vi.fn(async ({ where }: { where: { constructionStageId: string } }) => leadsIn[where.constructionStageId] ?? 0) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { service: new ConstructionStagesService(db as never), rows };
}

const seeded = (): Row[] => [
  { id: 'p', key: 'planning', name: 'Planning', position: 10, isActive: true },
  { id: 'f', key: 'foundation', name: 'Foundation', position: 20, isActive: true },
  { id: 'r', key: 'roof', name: 'Roof', position: 30, isActive: false },
];

describe('construction stages (admin-managed, independent of the lead status)', () => {
  it('a new stage goes after the one picked, and the list is renumbered in order', async () => {
    const { service, rows } = setup(seeded());
    await service.create('Lintel', 'f');
    const order = [...rows].sort((a, b) => a.position - b.position).map((r) => r.name);
    expect(order).toEqual(['Planning', 'Foundation', 'Lintel', 'Roof']);
  });

  it('"Not known" is reserved for leads with no stage, and names stay unique', async () => {
    const { service } = setup(seeded());
    await expect(service.create(NOT_KNOWN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.rename('p', 'not known')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('foundation')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a lead can only be put in a switched-on stage; null (Not known) is always fine', async () => {
    const { service } = setup(seeded());
    expect(await service.usable(null)).toBeNull();
    expect(await service.usable('f')).toMatchObject({ name: 'Foundation' });
    await expect(service.usable('r')).rejects.toThrow(/switched off/);
    await expect(service.usable('nope')).rejects.toThrow(/does not exist/);
  });

  it('a stage with leads can only be switched off, not deleted; an empty one can go', async () => {
    const { service, rows } = setup(seeded(), { f: 3 });
    await expect(service.delete('f')).rejects.toBeInstanceOf(ConflictException);
    await service.delete('r');
    expect(rows.map((r) => r.name)).toEqual(['Planning', 'Foundation']);
  });

  it('reordering needs every stage exactly once', async () => {
    const { service, rows } = setup(seeded());
    await expect(service.reorder(['p', 'f'])).rejects.toBeInstanceOf(BadRequestException);
    await service.reorder(['r', 'p', 'f']);
    expect([...rows].sort((a, b) => a.position - b.position).map((r) => r.key)).toEqual(['roof', 'planning', 'foundation']);
  });
});
