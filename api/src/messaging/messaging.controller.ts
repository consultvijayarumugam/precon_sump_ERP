import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { CreateTemplateDto, ListTemplatesQueryDto, StartWhatsAppDto, UpdateTemplateDto } from './dto/messaging.dto.js';
import { MessagingService } from './messaging.service.js';
import { PLACEHOLDERS } from './whatsapp.js';

@ApiTags('crm: WhatsApp quick-contact')
@ApiBearerAuth()
@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('message-templates')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'WhatsApp message templates to pick from (active ones; ?all=true for admins)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTemplatesQueryDto) {
    if (query.all && !user.permissions.includes(PERMISSIONS.TEMPLATES_MANAGE)) {
      throw new ForbiddenException(`Listing switched-off templates needs ${PERMISSIONS.TEMPLATES_MANAGE}`);
    }
    return this.messaging.listTemplates(Boolean(query.all));
  }

  @Get('message-templates/placeholders')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'Placeholders templates can use, e.g. {name}' })
  placeholders() {
    return Object.entries(PLACEHOLDERS).map(([key, description]) => ({ key: `{${key}}`, description }));
  }

  @Post('message-templates')
  @RequirePermissions(PERMISSIONS.TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Create a template' })
  create(@Body() dto: CreateTemplateDto) {
    return this.messaging.createTemplate(dto);
  }

  @Patch('message-templates/:id')
  @RequirePermissions(PERMISSIONS.TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Edit, reorder or switch off a template' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.messaging.updateTemplate(id, dto);
  }

  @Delete('message-templates/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Delete a template (past messages keep its name)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.messaging.deleteTemplate(id);
  }

  @Post('leads/:id/whatsapp')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'Start a WhatsApp message to a lead: fills the template, logs it on the lead, returns the wa.me link',
    description: 'Indian numbers get country code 91 if missing. Only leads you can see (404 otherwise).',
  })
  start(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartWhatsAppDto) {
    return this.messaging.startWhatsApp(user, id, dto);
  }

  @Get('leads/:id/messages')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'WhatsApp messages started on a lead, newest first' })
  activity(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.activity(user, id);
  }
}
