import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PublicCreateLeadDto } from '../intake/dto/intake.dto.js';
import { normalizeLeadPhone, phoneMatchKey, phoneSearchKey } from '../intake/intake-parsing.js';
import { QuickAddService } from '../intake/quick-add.service.js';
import { renderTemplate } from '../messaging/whatsapp.js';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto.js';
import { formatPhone, leadLabel } from './lead-label.js';
import { LeadsService } from './leads.service.js';

const admin: AuthenticatedUser = {
  id: 'admin',
  email: 'a@x.in',
  fullName: 'Asha Admin',
  role: { key: 'admin', name: 'Admin' },
  permissions: ['leads.read', 'leads.read_all', 'leads.write', 'leads.assign'],
  modules: ['crm'],
  token: { jti: 'j', expiresAt: new Date() },
};

async function check<T extends object>(cls: new () => T, body: object) {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto);
  return { dto, errors: errors.flatMap((e) => Object.values(e.constraints ?? {})) };
}

describe('one phone rule for every lead path', () => {
  it('an Indian mobile is stored as +91…, however it was typed', () => {
    for (const typed of ['p:+919791006137', '9791006137', '+919791006137', '+91 97910 06137', '919791006137', '09791006137', '097910-06137', '0091 97910 06137']) {
      expect(normalizeLeadPhone(typed)).toBe('+919791006137');
    }
  });

  it('other countries (with +) and landlines with their 0 STD code are kept; junk is refused', () => {
    expect(normalizeLeadPhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizeLeadPhone('0422 2345678')).toBe('04222345678');
    expect(normalizeLeadPhone('12345')).toBeNull();
    expect(normalizeLeadPhone('1234567890')).toBeNull(); // not a mobile, no STD code
    expect(normalizeLeadPhone('447911123456')).toBeNull(); // another country needs its +
    expect(normalizeLeadPhone('call me')).toBeNull();
    expect(normalizeLeadPhone('')).toBeNull();
  });

  it('with and without +91 are the same number for duplicates and search', () => {
    expect(phoneMatchKey('9791006137')).toBe(phoneMatchKey('+919791006137'));
    expect(phoneSearchKey('+91 97910 06137')).toBe('9791006137');
    expect(phoneSearchKey('06137')).toBe('06137');
    expect(phoneSearchKey('Ravi')).toBeNull();
    expect(phoneSearchKey('97')).toBeNull();
  });
});

describe('phone is the only required field', () => {
  it('New lead (web and mobile): just a phone is valid; it is normalised and nothing else is needed', async () => {
    const { dto, errors } = await check(CreateLeadDto, { phone: '97910 06137' });
    expect(errors).toEqual([]);
    expect(dto.phone).toBe('+919791006137');
    expect(dto.name).toBeUndefined();
    expect(dto.source).toBeUndefined();
  });

  it('a blank name from a form counts as no name', async () => {
    const { dto, errors } = await check(CreateLeadDto, { phone: '9791006137', name: '   ', city: '' });
    expect(errors).toEqual([]);
    expect(dto.name).toBeNull();
  });

  it('no phone, or a phone that is not a number, is the one thing refused', async () => {
    expect((await check(CreateLeadDto, { name: 'Ravi' })).errors.join()).toMatch(/phone isn't a valid number/);
    expect((await check(CreateLeadDto, { phone: '12345' })).errors.join()).toMatch(/phone isn't a valid number/);
    expect((await check(CreateLeadDto, { phone: '1234567890' })).errors.join()).toMatch(/phone isn't a valid number/);
    expect((await check(PublicCreateLeadDto, { phone: '1234567890' })).errors.join()).toMatch(/phone isn't a valid number/);
  });

  it('an edit can clear the name', async () => {
    const { dto, errors } = await check(UpdateLeadDto, { name: '' });
    expect(errors).toEqual([]);
    expect(dto.name).toBeNull();
  });

  it('public API: phone only is enough', async () => {
    const { dto, errors } = await check(PublicCreateLeadDto, { phone: '+91-97910-06137' });
    expect(errors).toEqual([]);
    expect(dto.phone).toBe('+919791006137');
    expect(dto.name).toBeUndefined();
  });
});

describe('showing a lead with no name', () => {
  it('uses the phone number, nicely spaced; a name wins once added', () => {
    expect(leadLabel({ name: null, phone: '+919791006137' })).toBe('+91 97910 06137');
    expect(leadLabel({ name: '  ', phone: '9791006137' })).toBe('97910 06137');
    expect(leadLabel({ name: 'Ravi Kumar', phone: '+919791006137' })).toBe('Ravi Kumar');
    expect(formatPhone('+442079460958')).toBe('+442079460958');
  });

  it('WhatsApp templates fall back to a neutral greeting', () => {
    const noName = { name: null, first_name: null, my_name: 'Tara', company: 'Precon' };
    expect(renderTemplate('Hi {first_name}, this is {my_name} from {company}.', noName)).toBe('Hi, this is Tara from Precon.');
    expect(renderTemplate('Dear {name}, as discussed, the quote is attached.', noName)).toBe('Dear Sir/Madam, as discussed, the quote is attached.');
    expect(renderTemplate('Thanks {name} for your enquiry.', noName)).toBe('Thanks for your enquiry.');
    // A phone-only lead has no city or product either: the words that needed them drop out too.
    const quote = 'Dear {name}, as discussed, I am sharing the quotation for your {product}. Delivery and installation in {city} are included.';
    expect(renderTemplate(quote, noName)).toBe('Dear Sir/Madam, as discussed, I am sharing the quotation. Delivery and installation are included.');
    expect(renderTemplate('Following up on your {product} enquiry.', noName)).toBe('Following up on your enquiry.');
    expect(renderTemplate(quote, { ...noName, name: 'Ravi', product: 'Sump · 10,000 L', city: 'Erode' })).toBe(
      'Dear Ravi, as discussed, I am sharing the quotation for your Sump · 10,000 L. Delivery and installation in Erode are included.',
    );
    expect(renderTemplate('See you in {cty}.', noName)).toBe('See you in {cty}.'); // a typo stays visible
    const named = { ...noName, name: 'Ravi Kumar', first_name: 'Ravi' };
    expect(renderTemplate('Dear {name}, hi {first_name}.', named)).toBe('Dear Ravi Kumar, hi Ravi.');
  });
});

describe('New lead by hand: duplicates by phone', () => {
  function setup(existing: { id: string; name: string | null; phone: string; status: string; assignedTo: { fullName: string } | null } | null) {
    const created: Record<string, unknown>[] = [];
    const activities: { summary?: string; message?: string }[] = [];
    const db = {
      $queryRaw: vi.fn(async () => [{ locked: '' }]),
      lead: {
        findFirst: vi.fn(async ({ where }: { where: { phone?: { endsWith: string }; id?: unknown } }) => {
          if (where.phone) return existing && existing.phone.endsWith(where.phone.endsWith) ? existing : null;
          return { id: 'new', name: created[0]?.name ?? null, phone: created[0]?.phone };
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'new', name: data.name, phone: data.phone, assignedTo: null };
        }),
      },
      leadActivity: { create: vi.fn(async ({ data }: { data: { message: string } }) => activities.push(data)) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
    };
    const stages = { byKind: vi.fn(async () => ({ id: 'stage-new', name: 'New', phase: 'NEW' })) };
    return { service: new LeadsService(db as never, {} as never, stages as never), created, activities };
  }

  it('a phone-only lead is created with no name and source Manual', async () => {
    const { service, created } = setup(null);
    await service.create(admin, { phone: '+919791006137' } as CreateLeadDto);
    expect(created[0]).toMatchObject({ name: null, phone: '+919791006137', source: 'MANUAL', productInterest: null, city: null });
  });

  it('the same number as an open lead (stored without +91) is refused with 409, naming that lead', async () => {
    const { service, created } = setup({ id: 'old', name: null, phone: '9791006137', status: 'CONTACTED', assignedTo: { fullName: 'Tara' } });
    const err = await service.create(admin, { phone: '+919791006137' } as CreateLeadDto).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      message: '+91 97910 06137 is already an open lead (Contacted, with Tara). Open that lead instead.',
      existingLeadId: 'old',
    });
    expect(created).toEqual([]);
  });
});

describe('Quick add with just a number', () => {
  it('saves no stand-in name (screens show the phone)', async () => {
    const intake = { create: vi.fn(async () => ({ status: 'created', leadId: 'L1', assignedTo: { id: 't', fullName: 'Tara' }, autoAssigned: true })) };
    const prisma = { lead: { count: vi.fn(async () => 1), findFirst: vi.fn(async () => null) } };
    const assignment = { rotationIds: vi.fn(async () => ['t']) };
    const service = new QuickAddService(prisma as never, intake as never, assignment as never);
    const result = await service.add(admin, { phone: '97910 06137' });
    expect(intake.create).toHaveBeenCalledWith(expect.objectContaining({ name: null, phone: '+919791006137', source: 'WHATSAPP', duplicates: 'open' }));
    expect(result).toMatchObject({ status: 'created', lead: { name: null, phone: '+919791006137' } });
  });
});
