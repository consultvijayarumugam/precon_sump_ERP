import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser } from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications (in-app)')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({
    summary: 'Your bell: reminders (callbacks/follow-ups due today or overdue) and updates (leads assigned or handed to you)',
    description: 'Reminders disappear by themselves once the follow-up is done. In-app only.',
  })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.list(user);
  }

  @Get('summary')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Daily "my reminders": overdue and due-today follow-ups, leads assigned / handed to you today' })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.summary(user);
  }

  @Post('read-all')
  @HttpCode(200)
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Mark all your notifications read' })
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(':id/read')
  @HttpCode(200)
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Mark one of your notifications read' })
  read(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user, id);
  }
}
