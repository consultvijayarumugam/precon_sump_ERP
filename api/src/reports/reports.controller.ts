import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, RequireAnyPermission } from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { ReportQueryDto } from './dto/reports.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @RequireAnyPermission(PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_VIEW_ALL)
  @ApiOperation({ summary: 'Reports you can open, and whether you see everyone (all) or only your own data (own)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.available(user);
  }

  @Get(':key')
  @RequireAnyPermission(PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_VIEW_ALL)
  @ApiOperation({
    summary: 'Run a report for a date range (JSON, or ?format=csv|xlsx to download)',
    description:
      'Keys: leads-by-source, telecallers, pipeline, revenue, follow-ups. reports.view_all sees everyone; reports.view only rows about you. ' +
      'Revenue also needs sales.read (own) or sales.read_all / finance.dashboard (everyone).',
  })
  async run(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.reports.run(user, key, query);
    if (!query.format) return report;
    const file = await this.reports.export(report, query.format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.body);
  }
}
