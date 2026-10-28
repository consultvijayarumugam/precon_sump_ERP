import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, Public, RequirePermissions } from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { businessToday, dateOnly } from '../finance/finance-utils.js';
import { ApiKeyAuth, ApiKeyThrottlerGuard } from './api-key.guard.js';
import type { ApiKeyCaller } from './api-key.guard.js';
import { ApiKeysService } from './api-keys.service.js';
import {
  CreateApiKeyDto,
  DistributionQueryDto,
  ImportOptionsDto,
  PublicCreateLeadDto,
  SetRotationDto,
  TemplateQueryDto,
} from './dto/intake.dto.js';
import { LeadAssignmentService } from './lead-assignment.service.js';
import { LeadImportService, MAX_IMPORT_BYTES } from './lead-import.service.js';
import { LeadIntakeService } from './lead-intake.service.js';
import { MetaWebhookService } from './meta-webhook.service.js';
import type { MetaWebhookPayload } from './meta-webhook.service.js';

@ApiTags('crm: lead import')
@ApiBearerAuth()
@Controller('leads/import')
export class LeadImportController {
  constructor(private readonly importer: LeadImportService) {}

  @Get('template')
  @RequirePermissions(PERMISSIONS.LEADS_WRITE)
  @ApiOperation({ summary: 'Download the import template (format=xlsx or csv)' })
  async template(@Query() query: TemplateQueryDto, @Res({ passthrough: true }) res: Response) {
    const file = await this.importer.template(query.format ?? 'xlsx');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.body);
  }

  @Post()
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEADS_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary: 'Import leads from a .csv or .xlsx file (needs leads.write)',
    description:
      'Only name and phone are required (a Meta lead export works as is). Rows whose phone already exists are skipped as ' +
      'duplicates; invalid rows are reported with reasons; the rest are created. Rows with no assigned salesperson are shared ' +
      'round-robin across the telecallers in the rotation. A file that is not a readable CSV/XLSX, or lacks the name/phone ' +
      'columns, imports nothing (400). Optional form field defaultSource sets the source for rows that leave it blank.',
  })
  import(
    @CurrentUser() user: AuthenticatedUser,
    @Body() options: ImportOptionsDto,
    @UploadedFile() file?: { originalname: string; buffer: Buffer; size: number },
  ) {
    return this.importer.import(user, file, { defaultSource: options.defaultSource });
  }
}

@ApiTags('admin: API keys')
@ApiBearerAuth()
@Controller('api-keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly meta: MetaWebhookService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.APIKEYS_MANAGE)
  @ApiOperation({ summary: 'List API keys (prefix only; full keys are never shown again)' })
  list() {
    return this.apiKeys.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.APIKEYS_MANAGE)
  @ApiOperation({ summary: 'Create an API key. The response contains the full key ONCE; store it safely.' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user.id, dto.name);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.APIKEYS_MANAGE)
  @ApiOperation({ summary: 'Revoke a key; requests with it are rejected from now on' })
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.apiKeys.revoke(id);
  }

  @Get('meta-status')
  @RequirePermissions(PERMISSIONS.APIKEYS_MANAGE)
  @ApiOperation({ summary: 'Which Meta webhook settings are present (values are never returned)' })
  metaStatus() {
    return this.meta.status();
  }
}

@ApiTags('crm: lead assignment')
@ApiBearerAuth()
@Controller('lead-assignment')
export class LeadAssignmentController {
  constructor(private readonly assignment: LeadAssignmentService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LEADS_ASSIGN)
  @ApiOperation({
    summary: "A day's leads and how they were shared across the telecallers (default today)",
    description: 'Also lists everyone in the rotation (leads.auto_assign holders) with their on/off switch and who is next.',
  })
  distribution(@Query() query: DistributionQueryDto) {
    return this.assignment.distribution(query.date ?? dateOnly(businessToday()));
  }

  @Patch('members/:userId')
  @RequirePermissions(PERMISSIONS.LEADS_ASSIGN)
  @ApiOperation({ summary: 'Switch a telecaller in or out of the round-robin: {enabled}' })
  setEnabled(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: SetRotationDto) {
    return this.assignment.setEnabled(userId, dto.enabled);
  }
}

@ApiTags('public API (API key)')
@Controller('public')
export class PublicLeadsController {
  constructor(
    private readonly intake: LeadIntakeService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  @Post('leads')
  @ApiKeyAuth()
  @ApiOperation({
    summary: 'Create a lead from an external system (X-API-Key header)',
    description:
      'New leads go to the next telecaller in the round-robin. 201 {status:"created", leadId, assignedTo} for a new lead. 200 {status:"duplicate", reason:"phone"|"externalId", leadId} if the phone ' +
      '(last 10 digits) or your externalId already exists; nothing is created. 400 for invalid input, 401 for a missing/invalid/revoked ' +
      'key, 429 when over the rate limit.',
  })
  async create(
    @Req() req: Request & { apiKey: ApiKeyCaller },
    @Body() dto: PublicCreateLeadDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = req.apiKey;
    const result = await this.intake.create({
      name: dto.name,
      phone: dto.phone,
      email: dto.email ?? null,
      city: dto.city ?? null,
      source: dto.source ?? 'API',
      // A size without a product means a sump.
      productInterest: dto.product ?? (dto.sumpSizeLitres ? 'SUMP' : null),
      sumpSizeLitres: (dto.product ?? 'SUMP') === 'SUMP' ? (dto.sumpSizeLitres ?? null) : null,
      notes: dto.notes ?? null,
      assignedToId: null,
      rotation: await this.assignment.rotationIds(),
      createdById: key.createdById,
      sourceDetail: `API key: ${key.name}`,
      externalRef: dto.externalId ? `api:${key.id}:${dto.externalId}` : null,
    });
    if (result.status === 'created') {
      return { status: 'created', leadId: result.leadId, assignedTo: result.assignedTo?.fullName ?? null };
    }
    res.status(200);
    return {
      status: 'duplicate',
      reason: result.reason === 'externalRef' ? 'externalId' : 'phone',
      leadId: result.leadId,
      message: 'A lead with this phone number (or externalId) already exists; nothing was created.',
    };
  }
}

@ApiTags('webhooks: Meta lead ads')
@Controller('webhooks/meta')
@UseGuards(ApiKeyThrottlerGuard)
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class MetaWebhookController {
  constructor(private readonly meta: MetaWebhookService) {}

  @Get()
  @Public()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: "Meta's subscription check: echoes hub.challenge if hub.verify_token matches META_VERIFY_TOKEN" })
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    return this.meta.verify(mode, token, challenge);
  }

  @Post()
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Lead Ads "leadgen" notifications from Meta (signed with X-Hub-Signature-256)' })
  async receive(@Req() req: RawBodyRequest<Request>, @Body() payload: MetaWebhookPayload) {
    this.meta.checkSignature(req.rawBody, req.headers['x-hub-signature-256'] as string | undefined);
    const results = await this.meta.handle(payload);
    return { received: true, results };
  }
}
