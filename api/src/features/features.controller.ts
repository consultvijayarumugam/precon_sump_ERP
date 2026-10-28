import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../access-control/access-policy.decorators.js';
import { operationsEnabled } from './features.js';

@ApiTags('platform')
@Controller('config')
export class FeaturesController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Which product modules are switched on (the web app hides what is off)' })
  config() {
    return { operationsEnabled: operationsEnabled() };
  }
}
