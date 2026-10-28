import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { ApiKeyGuard, ApiKeyThrottlerGuard } from './api-key.guard.js';
import { ApiKeysService } from './api-keys.service.js';
import {
  ApiKeysController,
  LeadAssignmentController,
  LeadImportController,
  MetaWebhookController,
  PublicLeadsController,
} from './intake.controller.js';
import { LeadAssignmentService } from './lead-assignment.service.js';
import { LeadImportService } from './lead-import.service.js';
import { LeadIntakeService } from './lead-intake.service.js';
import { MetaWebhookService } from './meta-webhook.service.js';

/**
 * Getting leads in from outside (#1, #21): bulk import, the public API with
 * API keys, and the Meta Lead Ads webhook. All three go through
 * LeadIntakeService, which skips duplicates by phone and shares new leads
 * round-robin across the telecallers (LeadAssignmentService).
 */
@Module({
  imports: [
    AccessControlModule,
    // Only applied where @UseGuards(ApiKeyThrottlerGuard) is used (public API, webhook).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: Number(process.env.PUBLIC_API_RATE_LIMIT ?? 60) }]),
  ],
  controllers: [LeadImportController, LeadAssignmentController, ApiKeysController, PublicLeadsController, MetaWebhookController],
  exports: [LeadAssignmentService],
  providers: [LeadAssignmentService, LeadIntakeService, LeadImportService, ApiKeysService, MetaWebhookService, ApiKeyGuard, ApiKeyThrottlerGuard],
})
export class IntakeModule {}
