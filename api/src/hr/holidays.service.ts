import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { businessToday, dateOnly, parseDateOnly } from '../finance/finance-utils.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HolidayDto, UpdateHolidayDto } from './dto/hr.dto.js';

/** Company holidays (#16). Changing them changes leave/LOP day counts, which are always computed. */
@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(year?: number) {
    const y = year ?? businessToday().getUTCFullYear();
    const rows = await this.prisma.holiday.findMany({
      where: { date: { gte: parseDateOnly(`${y}-01-01`), lte: parseDateOnly(`${y}-12-31`) } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, name: true },
    });
    return rows.map((h) => ({ ...h, date: dateOnly(h.date) }));
  }

  async upcoming(limit = 3) {
    const rows = await this.prisma.holiday.findMany({
      where: { date: { gte: businessToday() } },
      orderBy: { date: 'asc' },
      take: limit,
      select: { id: true, date: true, name: true },
    });
    return rows.map((h) => ({ ...h, date: dateOnly(h.date) }));
  }

  async create(dto: HolidayDto) {
    await this.ensureDateFree(dto.date);
    const h = await this.prisma.holiday.create({
      data: { date: parseDateOnly(dto.date), name: dto.name },
      select: { id: true, date: true, name: true },
    });
    return { ...h, date: dateOnly(h.date) };
  }

  async update(id: string, dto: UpdateHolidayDto) {
    await this.ensureExists(id);
    if (dto.date) await this.ensureDateFree(dto.date, id);
    const h = await this.prisma.holiday.update({
      where: { id },
      data: { date: dto.date ? parseDateOnly(dto.date) : undefined, name: dto.name },
      select: { id: true, date: true, name: true },
    });
    return { ...h, date: dateOnly(h.date) };
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.holiday.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    if (!(await this.prisma.holiday.count({ where: { id } }))) throw new NotFoundException('Holiday not found');
  }

  private async ensureDateFree(date: string, exceptId?: string) {
    const clash = await this.prisma.holiday.findUnique({ where: { date: parseDateOnly(date) }, select: { id: true, name: true } });
    if (clash && clash.id !== exceptId) throw new ConflictException(`${date} is already a holiday (${clash.name})`);
  }
}
