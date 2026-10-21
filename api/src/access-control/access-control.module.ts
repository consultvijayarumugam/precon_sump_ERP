import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessControlService } from './access-control.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

@Module({
  providers: [
    AccessControlService,
    // Order matters: authenticate first, then check permission tags.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AccessControlService],
})
export class AccessControlModule {}
