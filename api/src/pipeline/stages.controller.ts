import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../access-control/access-policy.decorators.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { CreateStageDto, ReorderStagesDto, UpdateStageDto } from './dto/stages.dto.js';
import { StagesService } from './stages.service.js';

@ApiTags('crm: pipeline stages')
@ApiBearerAuth()
@Controller('pipeline-stages')
export class StagesController {
  constructor(private readonly stages: StagesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'Pipeline stages in order (inactive ones too), with lead counts',
    description: 'kind ENTRY / MIDDLE / WON / LOST; phase = the fixed status the stage counts as; isHandover = where qualify hands to sales.',
  })
  list() {
    return this.stages.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Add a middle stage (after afterStageId, or just before Won/Lost)' })
  create(@Body() dto: CreateStageDto) {
    return this.stages.create(dto.name, dto.afterStageId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Rename or switch a middle stage on/off (New, Won, Lost are protected; the handover stage stays on)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStageDto) {
    if (dto.name !== undefined) await this.stages.rename(id, dto.name);
    if (dto.isActive !== undefined) await this.stages.setActive(id, dto.isActive);
    return this.stages.get(id);
  }

  @Put('order')
  @RequirePermissions(PERMISSIONS.PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Reorder the middle stages: {ids} = every middle stage, in order' })
  reorder(@Body() dto: ReorderStagesDto) {
    return this.stages.reorder(dto.ids);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Delete an empty middle stage (409 if it has leads: switch it off instead)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.stages.delete(id);
  }
}
