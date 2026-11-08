import { Global, Module } from '@nestjs/common';
import { StagesController } from './stages.controller.js';
import { StagesService } from './stages.service.js';

/** Admin-managed pipeline stages; StagesService is available everywhere (leads, workflow, reports, dashboards). */
@Global()
@Module({
  controllers: [StagesController],
  providers: [StagesService],
  exports: [StagesService],
})
export class PipelineModule {}
