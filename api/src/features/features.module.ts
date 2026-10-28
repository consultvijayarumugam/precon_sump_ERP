import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FeaturesController } from './features.controller.js';
import { OperationsGuard } from './operations.guard.js';

/** The OPERATIONS_ENABLED product switch: blocks operations routes and tells the web app what to show. */
@Module({
  controllers: [FeaturesController],
  providers: [{ provide: APP_GUARD, useClass: OperationsGuard }],
})
export class FeaturesModule {}
