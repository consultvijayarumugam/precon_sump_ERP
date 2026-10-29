import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { leadScope } from '../crm/lead-scope.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTemplateDto, StartWhatsAppDto, UpdateTemplateDto } from './dto/messaging.dto.js';
import { renderTemplate, waLink, waPhone } from './whatsapp.js';

const TEMPLATE_SELECT = { id: true, name: true, body: true, sortOrder: true, isActive: true, updatedAt: true } as const;
const sizeFormat = new Intl.NumberFormat('en-IN');

/** WhatsApp quick-contact: admin-managed templates, and starting (and logging) a message to a lead. */
@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  listTemplates(includeInactive: boolean) {
    return this.prisma.messageTemplate.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: TEMPLATE_SELECT,
    });
  }

  async createTemplate(dto: CreateTemplateDto) {
    try {
      return await this.prisma.messageTemplate.create({
        data: { name: dto.name, body: dto.body, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true },
        select: TEMPLATE_SELECT,
      });
    } catch (error) {
      throw this.nameClash(error);
    }
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    await this.ensureTemplate(id);
    try {
      return await this.prisma.messageTemplate.update({ where: { id }, data: dto, select: TEMPLATE_SELECT });
    } catch (error) {
      throw this.nameClash(error);
    }
  }

  /** Past messages keep the template's name, so deleting is safe. */
  async deleteTemplate(id: string) {
    await this.ensureTemplate(id);
    await this.prisma.messageTemplate.delete({ where: { id } });
  }

  /**
   * Fills the chosen template (or takes a typed message) for one of the
   * user's leads, records that a WhatsApp message was started, and returns
   * the wa.me link to open. WhatsApp itself sends nothing until the user taps
   * Send there, so this logs "initiated", not "delivered".
   */
  async startWhatsApp(user: AuthenticatedUser, leadId: string, dto: StartWhatsAppDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [{ id: leadId }, leadScope(user)] },
      select: { id: true, name: true, phone: true, city: true, productInterest: true, sumpSizeLitres: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (!waPhone(lead.phone)) throw new BadRequestException(`${lead.phone} isn't a mobile number WhatsApp can use`);

    let template: { id: string; name: string; body: string } | null = null;
    if (dto.templateId) {
      template = await this.prisma.messageTemplate.findFirst({
        where: { id: dto.templateId, isActive: true },
        select: { id: true, name: true, body: true },
      });
      if (!template) throw new BadRequestException('That template is not available');
    }

    const product =
      lead.productInterest === 'SUMP'
        ? lead.sumpSizeLitres
          ? `Sump · ${sizeFormat.format(lead.sumpSizeLitres)} L`
          : 'Sump'
        : lead.productInterest === 'MICROBES'
          ? 'Microbes'
          : '';
    const message = template
      ? renderTemplate(template.body, {
          name: lead.name,
          first_name: lead.name.split(/\s+/)[0],
          city: lead.city,
          product,
          my_name: user.fullName,
          company: process.env.COMPANY_NAME || 'Precon',
        })
      : (dto.message ?? '').trim();

    const activity = await this.prisma.leadActivity.create({
      data: {
        leadId,
        userId: user.id,
        type: 'WHATSAPP',
        templateId: template?.id ?? null,
        templateName: template?.name ?? null,
        message: message.slice(0, 4000),
      },
      select: { id: true, createdAt: true },
    });
    return { activityId: activity.id, url: waLink(lead.phone, message), message, phone: waPhone(lead.phone) };
  }

  /** WhatsApp messages started on a lead, newest first. */
  async activity(user: AuthenticatedUser, leadId: string) {
    const lead = await this.prisma.lead.count({ where: { AND: [{ id: leadId }, leadScope(user)] } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.leadActivity.findMany({
      where: { leadId, type: 'WHATSAPP' }, // the rest of the history is the admin-only timeline
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, type: true, templateName: true, message: true, createdAt: true, user: { select: { id: true, fullName: true } } },
    });
  }

  private async ensureTemplate(id: string) {
    if (!(await this.prisma.messageTemplate.count({ where: { id } }))) throw new NotFoundException('Template not found');
  }

  private nameClash(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      ? new ConflictException('A template with that name already exists')
      : error;
  }
}
