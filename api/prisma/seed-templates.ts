/**
 * Starter WhatsApp message templates (intro, follow-up, quotation). Created
 * only when there are none, so the admin's edits are never overwritten.
 */
import type { PrismaClient } from '../src/generated/prisma/client.js';

export const STARTER_TEMPLATES = [
  {
    name: 'Intro message',
    sortOrder: 1,
    body:
      'Hi {first_name}, this is {my_name} from {company}. Thank you for your enquiry about our precast concrete sumps. ' +
      'When is a good time for a quick call to understand your need?',
  },
  {
    name: 'Follow-up message',
    sortOrder: 2,
    body:
      'Hi {first_name}, {my_name} from {company} here. Following up on your {product} enquiry. ' +
      'Shall I call you today, or is tomorrow better?',
  },
  {
    name: 'Quotation message',
    sortOrder: 3,
    body:
      'Dear {name}, as discussed, I am sharing the quotation for your {product}. ' +
      'Delivery and installation in {city} are included. Please reply here with any questions. - {my_name}, {company}',
  },
];

export async function seedMessageTemplates(prisma: PrismaClient) {
  if ((await prisma.messageTemplate.count()) > 0) {
    console.log('Message templates already exist; skipping starter templates.');
    return;
  }
  await prisma.messageTemplate.createMany({ data: STARTER_TEMPLATES });
  console.log(`Seeded ${STARTER_TEMPLATES.length} WhatsApp message templates.`);
}
