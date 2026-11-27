import { Global, Module } from '@nestjs/common';
import { ConstructionStagesController } from './construction-stages.controller.js';
import { ConstructionStagesService } from './construction-stages.service.js';
import { StagesController } from './stages.controller.js';
import { StagesService } from './stages.service.js';

/** Admin-managed lead statuses (pipeline stages) and construction stages; both services are available everywhere. */
@Global()
@Module({
  controllers: [StagesController, ConstructionStagesController],
  providers: [StagesService, ConstructionStagesService],
  exports: [StagesService, ConstructionStagesService],
})
export class PipelineModule {}
