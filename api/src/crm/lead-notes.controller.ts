import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { LeadNoteDto } from './dto/lead-note.dto.js';
import { LeadNotesService } from './lead-notes.service.js';

const SHARED =
  "Shared: everyone who can see the lead sees every note (its salesperson, the telecaller who worked it, admins). 404 for leads you can't see.";

@ApiTags('crm: shared lead notes')
@ApiBearerAuth()
@Controller('leads/:id/notes')
export class LeadNotesController {
  constructor(private readonly notes: LeadNotesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: "A lead's shared notes, oldest first", description: SHARED })
  list(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.list(user, id);
  }

  @Post()
  @RequireAnyPermission(PERMISSIONS.LEADS_WRITE, PERMISSIONS.LEADS_QUALIFY)
  @ApiOperation({
    summary: 'Add a shared note (leads.write or leads.qualify)',
    description: `${SHARED} The other people on the lead get a notification; the change history records it.`,
  })
  add(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeadNoteDto) {
    return this.notes.add(user, id, dto.body);
  }

  @Patch(':noteId')
  @RequireAnyPermission(PERMISSIONS.LEADS_WRITE, PERMISSIONS.LEADS_QUALIFY)
  @ApiOperation({ summary: 'Edit your own shared note', description: 'Only the author can edit a note. The change history keeps the old and new text.' })
  edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: LeadNoteDto,
  ) {
    return this.notes.edit(user, id, noteId, dto.body);
  }
}
