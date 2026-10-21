import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { RolesController } from './roles.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AccessControlModule],
  controllers: [UsersController, RolesController],
  providers: [UsersService],
})
export class UsersModule {}
