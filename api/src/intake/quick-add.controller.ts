import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { QuickAddLeadDto } from './dto/quick-add.dto.js';
import { QuickAddService } from './quick-add.service.js';

@ApiTags('crm: quick add (WhatsApp enquiries)')
@ApiBearerAuth()
@Controller('leads/quick-add')
export class QuickAddController {
  constructor(private readonly quickAdd: QuickAddService) {}

  @Post()
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEADS_QUICK_ADD)
  @ApiOperation({
    summary: 'Log a WhatsApp enquiry: phone required, name and first message optional',
    description:
      'The phone is normalised to +91XXXXXXXXXX. Creates a WhatsApp lead for the next telecaller in the round-robin and ' +
      'returns {status: "created", lead, assignedTo, previous, addedToday}. If the number is already an open lead, nothing is ' +
      'created: {status: "duplicate", existing, addedToday}. A past Won or Lost customer gets a new lead (`previous` points to the old one).',
  })
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: QuickAddLeadDto) {
    return this.quickAdd.add(user, dto);
  }

  @Get('today')
  @RequirePermissions(PERMISSIONS.LEADS_QUICK_ADD)
  @ApiOperation({ summary: "Today's quick adds (yours and everyone's), and how today's leads are spread across telecallers" })
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.quickAdd.today(user);
  }
}
