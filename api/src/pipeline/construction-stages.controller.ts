import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../access-control/access-policy.decorators.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { ConstructionStagesService } from './construction-stages.service.js';
import { CreateConstructionStageDto, ReorderStagesDto, UpdateStageDto } from './dto/stages.dto.js';

@ApiTags('crm: construction stages')
@ApiBearerAuth()
@Controller('construction-stages')
export class ConstructionStagesController {
  constructor(private readonly stages: ConstructionStagesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'Construction stages in order (switched-off ones too), with lead counts',
    description: '{notKnown: {name, leads}, stages: [{id, key, name, position, isActive, leads}]}. "Not known" = a lead with no construction stage.',
  })
  list() {
    return this.stages.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Add a construction stage (after afterId, or at the end)' })
  create(@Body() dto: CreateConstructionStageDto) {
    return this.stages.create(dto.name, dto.afterId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Rename a construction stage or switch it on/off' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStageDto) {
    if (dto.name !== undefined) await this.stages.rename(id, dto.name);
    if (dto.isActive !== undefined) await this.stages.setActive(id, dto.isActive);
    return this.stages.get(id);
  }

  @Put('order')
  @RequirePermissions(PERMISSIONS.PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Reorder: {ids} = every construction stage, in order' })
  reorder(@Body() dto: ReorderStagesDto) {
    return this.stages.reorder(dto.ids);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Delete an empty construction stage (409 if leads have it: switch it off instead)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.stages.delete(id);
  }
}
