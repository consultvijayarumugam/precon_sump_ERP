import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './access-control/access-policy.decorators.js';
import { PrismaService } from './prisma/prisma.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'API and database are up' })
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok', time: new Date().toISOString() };
  }
}
