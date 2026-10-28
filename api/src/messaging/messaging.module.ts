import { Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller.js';
import { MessagingService } from './messaging.service.js';

/** WhatsApp quick-contact: message templates and wa.me links, logged on the lead. */
@Module({
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
