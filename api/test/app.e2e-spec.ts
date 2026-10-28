import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

// Needs the local database from .env (run migrations + seed first).
describe('Auth and RBAC (e2e)', () => {
  let app: INestApplication<App>;
  const operationsBefore = process.env.OPERATIONS_ENABLED;

  beforeAll(async () => {
    // The finance, service and HR tests below exercise the operations modules, so they run with the switch on.
    // The product-switch tests at the end flip it off and back.
    process.env.OPERATIONS_ENABLED = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    process.env.OPERATIONS_ENABLED = operationsBefore;
    await app.close();
  });

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: process.env.SEED_USER_PASSWORD });

  it('health is public', () =>
    request(app.getHttpServer()).get('/api/v1/health').expect(200));

  it('protected routes need a token', () =>
    request(app.getHttpServer()).get('/api/v1/users').expect(401));

  it('rejects a wrong password', () =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@precon.local', password: 'wrong' })
      .expect(401));

  it('admin can list users; sales cannot', async () => {
    const admin = (await login('admin@precon.local').expect(200)).body;
    const sales = (await login('sales@precon.local').expect(200)).body;

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${sales.accessToken}`)
      .expect(403);
  });

  it('a logged-out token stops working', async () => {
    const { accessToken } = (await login('telecaller@precon.local')).body;
    const auth = { Authorization: `Bearer ${accessToken}` };

    await request(app.getHttpServer()).get('/api/v1/auth/me').set(auth).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set(auth).expect(204);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set(auth).expect(401);
  });

  describe('CRM leads and follow-ups', () => {
    const createdLeadIds: string[] = [];
    let admin: string;
    let sales: string;
    let sales2: string;

    const as = (token: string) => ({ Authorization: `Bearer ${token}` });

    beforeAll(async () => {
      admin = (await login('admin@precon.local')).body.accessToken;
      sales = (await login('sales@precon.local')).body.accessToken;
      sales2 = (await login('sales2@precon.local')).body.accessToken;
    });

    afterAll(async () => {
      // Remove test leads so the demo data stays clean.
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      await app.get(PrismaService).lead.deleteMany({ where: { id: { in: createdLeadIds } } });
    });

    it('admin sees all leads; sales sees only their own', async () => {
      const all = await request(app.getHttpServer()).get('/api/v1/leads').set(as(admin)).expect(200);
      const mine = await request(app.getHttpServer()).get('/api/v1/leads').set(as(sales)).expect(200);
      expect(mine.body.total).toBeLessThan(all.body.total);
      expect(
        mine.body.items.every((l: { assignedTo: { fullName: string } | null }) =>
          l.assignedTo?.fullName === 'Suresh Sales'),
      ).toBe(true);
    });

    it('telecaller preset: can read leads and log follow-ups, but not edit leads or see finance', async () => {
      const telecaller = (await login('telecaller@precon.local')).body.accessToken;
      await request(app.getHttpServer()).get('/api/v1/leads').set(as(telecaller)).expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set(as(telecaller))
        .send({ name: 'E2E nope', phone: '9000099999', source: 'MANUAL', productInterest: 'SUMP' })
        .expect(403);
      await request(app.getHttpServer()).get('/api/v1/sales-orders').set(as(telecaller)).expect(403);
      await request(app.getHttpServer()).get('/api/v1/stock').set(as(telecaller)).expect(403);
    });

    it('sales creates a lead (auto-assigned), cannot reassign it, and another salesperson cannot see it', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set(as(sales))
        .send({ name: 'E2E Lead', phone: '98765 11111', source: 'MANUAL', productInterest: 'SUMP', sumpSizeLitres: 10000 })
        .expect(201);
      createdLeadIds.push(created.body.id);
      expect(created.body.phone).toBe('9876511111');
      expect(created.body.assignedTo.fullName).toBe('Suresh Sales');

      const assignees = await request(app.getHttpServer())
        .get('/api/v1/leads/assignees').set(as(admin)).expect(200);
      const priya = assignees.body.find((u: { fullName: string }) => u.fullName === 'Priya Sales');

      await request(app.getHttpServer())
        .patch(`/api/v1/leads/${created.body.id}`)
        .set(as(sales))
        .send({ assignedToId: priya.id })
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/v1/leads/${created.body.id}`).set(as(sales2)).expect(404);
    });

    it('won leads get closedAt; reopening clears it', async () => {
      const id = createdLeadIds[0];
      const won = await request(app.getHttpServer())
        .patch(`/api/v1/leads/${id}`).set(as(sales)).send({ status: 'WON' }).expect(200);
      expect(won.body.closedAt).not.toBeNull();

      const wonList = await request(app.getHttpServer())
        .get('/api/v1/leads?status=WON').set(as(sales)).expect(200);
      expect(wonList.body.items.some((l: { id: string }) => l.id === id)).toBe(true);

      const reopened = await request(app.getHttpServer())
        .patch(`/api/v1/leads/${id}`).set(as(sales)).send({ status: 'QUOTED' }).expect(200);
      expect(reopened.body.closedAt).toBeNull();
    });

    it('follow-ups: schedule, show as overdue, complete', async () => {
      const id = createdLeadIds[0];
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const fu = await request(app.getHttpServer())
        .post(`/api/v1/leads/${id}/follow-ups`)
        .set(as(sales))
        .send({ scheduledAt: past, note: 'E2E call' })
        .expect(201);

      const overdue = await request(app.getHttpServer())
        .get('/api/v1/follow-ups?state=overdue').set(as(sales)).expect(200);
      expect(overdue.body.some((f: { id: string }) => f.id === fu.body.id)).toBe(true);

      await request(app.getHttpServer())
        .post(`/api/v1/follow-ups/${fu.body.id}/complete`)
        .set(as(sales2))
        .send({ outcome: 'CONNECTED' })
        .expect(404);
      const done = await request(app.getHttpServer())
        .post(`/api/v1/follow-ups/${fu.body.id}/complete`)
        .set(as(sales))
        .send({ outcome: 'CONNECTED' })
        .expect(200);
      expect(done.body.completedAt).not.toBeNull();
    });

    it('rejects invalid lead input', () =>
      request(app.getHttpServer())
        .post('/api/v1/leads')
        .set(as(sales))
        .send({ name: 'X', phone: '12', source: 'TV', productInterest: 'SUMP' })
        .expect(400));
  });

  describe('Finance and stock', () => {
    let admin: string;
    let sales: string;
    let sales2: string;
    let supervisor: string;
    const created = { leadIds: [] as string[], orderIds: [] as string[], vendorIds: [] as string[] };
    const stockBefore = new Map<string, number>();

    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const http = () => request(app.getHttpServer());
    const today = new Date().toISOString().slice(0, 10);

    async function prisma() {
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      return app.get(PrismaService);
    }

    /** A fresh WON lead owned by Suresh (sales). */
    async function wonLead(name: string, productInterest = 'MICROBES', sumpSizeLitres?: number) {
      const res = await http()
        .post('/api/v1/leads')
        .set(as(sales))
        .send({ name, phone: '9000011111', source: 'MANUAL', productInterest, sumpSizeLitres, status: 'WON' })
        .expect(201);
      created.leadIds.push(res.body.id);
      return res.body.id as string;
    }

    beforeAll(async () => {
      admin = (await login('admin@precon.local')).body.accessToken;
      sales = (await login('sales@precon.local')).body.accessToken;
      sales2 = (await login('sales2@precon.local')).body.accessToken;
      supervisor = (await login('supervisor@precon.local')).body.accessToken;
      for (const p of await (await prisma()).product.findMany()) stockBefore.set(p.id, p.quantityOnHand);
    });

    afterAll(async () => {
      // Undo everything these tests created, and put stock back as it was.
      const db = await prisma();
      await db.stockMovement.deleteMany({ where: { OR: [{ salesOrderId: { in: created.orderIds } }, { note: 'e2e' }] } });
      await db.salesOrder.deleteMany({ where: { id: { in: created.orderIds } } });
      await db.lead.deleteMany({ where: { id: { in: created.leadIds } } });
      await db.vendor.deleteMany({ where: { id: { in: created.vendorIds } } });
      for (const [id, qty] of stockBefore) {
        await db.product.update({ where: { id }, data: { quantityOnHand: qty } });
      }
    });

    it('sales converts their won lead; duplicates and non-won leads are refused', async () => {
      const leadId = await wonLead('E2E Won Lead');
      const order = await http()
        .post('/api/v1/sales-orders')
        .set(as(sales))
        .send({ leadId, quantity: 2, totalAmount: 5000, dueDate: today })
        .expect(201);
      created.orderIds.push(order.body.id);
      expect(order.body.salesperson.fullName).toBe('Suresh Sales');
      expect(order.body.totalAmount).toBe('5000.00');
      expect(order.body).not.toHaveProperty('balanceDue'); // sales lacks payments.read

      await http().post('/api/v1/sales-orders').set(as(sales))
        .send({ leadId, quantity: 1, totalAmount: 1 }).expect(409);

      const openLead = await http().post('/api/v1/leads').set(as(sales))
        .send({ name: 'E2E Open Lead', phone: '9000022222', source: 'MANUAL', productInterest: 'SUMP' })
        .expect(201);
      created.leadIds.push(openLead.body.id);
      await http().post('/api/v1/sales-orders').set(as(sales))
        .send({ leadId: openLead.body.id, quantity: 1, totalAmount: 1 }).expect(400);

      // Another salesperson can't see it; the lead can't leave WON while it has an order.
      await http().get(`/api/v1/sales-orders/${order.body.id}`).set(as(sales2)).expect(404);
      await http().patch(`/api/v1/leads/${leadId}`).set(as(sales)).send({ status: 'QUOTED' }).expect(400);
    });

    it('sump orders: size comes from the lead or the order, must be valid, and picks that size\'s stock item', async () => {
      // Lead knows the size: the order inherits it.
      const sized = await wonLead('E2E Sump 6000', 'SUMP', 6000);
      const fromLead = await http().post('/api/v1/sales-orders').set(as(sales))
        .send({ leadId: sized, quantity: 1, totalAmount: 50000 }).expect(201);
      created.orderIds.push(fromLead.body.id);
      expect(fromLead.body.product.sku).toBe('SUMP-6000');
      expect(fromLead.body.product.name).toBe('Sump 6,000 L');

      // Lead without a size: the order must name one, and only a listed size.
      const unsized = await wonLead('E2E Sump no size', 'SUMP');
      const noSize = await http().post('/api/v1/sales-orders').set(as(sales))
        .send({ leadId: unsized, quantity: 1, totalAmount: 1 }).expect(400);
      expect(noSize.body.message).toMatch(/sump size/i);
      await http().post('/api/v1/sales-orders').set(as(sales))
        .send({ leadId: unsized, quantity: 1, totalAmount: 1, sizeLitres: 7000 }).expect(400);
      const picked = await http().post('/api/v1/sales-orders').set(as(sales))
        .send({ leadId: unsized, quantity: 1, totalAmount: 1, sizeLitres: 12000 }).expect(201);
      created.orderIds.push(picked.body.id);
      expect(picked.body.product.sku).toBe('SUMP-12000');

      // Microbes take no size.
      const microbes = await wonLead('E2E Microbes sized');
      await http().post('/api/v1/sales-orders').set(as(sales))
        .send({ leadId: microbes, quantity: 1, totalAmount: 1, sizeLitres: 3000 }).expect(400);

      // Leads: invalid sizes refused; switching to microbes clears the size.
      await http().post('/api/v1/leads').set(as(sales))
        .send({ name: 'E2E bad size', phone: '9000044444', source: 'MANUAL', productInterest: 'SUMP', sumpSizeLitres: 7000 })
        .expect(400);
      const switched = await http().patch(`/api/v1/leads/${sized}`).set(as(sales))
        .send({ productInterest: 'MICROBES' }).expect(200);
      expect(switched.body.sumpSizeLitres).toBeNull();
    });

    it('payments: sales cannot record; admin can; over-payment refused; balance tracked', async () => {
      const id = created.orderIds[0];
      const pay = { amount: 2000, paidOn: today, mode: 'UPI' };
      await http().post(`/api/v1/sales-orders/${id}/payments`).set(as(sales)).send(pay).expect(403);

      const after = await http().post(`/api/v1/sales-orders/${id}/payments`).set(as(admin)).send(pay).expect(201);
      expect(after.body.amountPaid).toBe('2000.00');
      expect(after.body.balanceDue).toBe('3000.00');

      await http().post(`/api/v1/sales-orders/${id}/payments`).set(as(admin))
        .send({ ...pay, amount: 3000.01 }).expect(400);
    });

    it('overdue view lists orders with a balance past due', async () => {
      const db = await prisma();
      const id = created.orderIds[0];
      await db.salesOrder.update({ where: { id }, data: { dueDate: new Date('2020-01-01T00:00:00Z') } });
      const res = await http().get('/api/v1/finance/overdue-balances').set(as(admin)).expect(200);
      const row = res.body.items.find((o: { id: string }) => o.id === id);
      expect(row.isOverdue).toBe(true);
      expect(row.balanceDue).toBe('3000.00');
      await http().get('/api/v1/finance/overdue-balances').set(as(sales)).expect(403);
    });

    it('revenue by employee: admin sees everyone, a salesperson only their own', async () => {
      const all = await http().get('/api/v1/finance/revenue-by-employee').set(as(admin)).expect(200);
      expect(all.body.scope).toBe('all');
      expect(all.body.rows.some((r: { salesperson: { fullName: string } }) => r.salesperson.fullName === 'Suresh Sales')).toBe(true);
      const own = await http().get('/api/v1/finance/revenue-by-employee').set(as(sales)).expect(200);
      expect(own.body.scope).toBe('own');
      expect(own.body.rows.every((r: { salesperson: { fullName: string } }) => r.salesperson.fullName === 'Suresh Sales')).toBe(true);
      await http().get('/api/v1/finance/summary').set(as(sales)).expect(403);
    });

    it('delivering reduces stock once; needs stock.write; refuses when stock is short', async () => {
      const id = created.orderIds[0];
      const db = await prisma();
      const product = await db.product.findUniqueOrThrow({ where: { sku: 'MICROBES' } });

      await http().post(`/api/v1/sales-orders/${id}/deliver`).set(as(sales)).expect(403);
      const res = await http().post(`/api/v1/sales-orders/${id}/deliver`).set(as(admin)).expect(200);
      expect(res.body.status).toBe('DELIVERED');
      const after = await db.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(after.quantityOnHand).toBe(product.quantityOnHand - 2);
      await http().post(`/api/v1/sales-orders/${id}/deliver`).set(as(admin)).expect(400);

      // An order bigger than stock can't be delivered.
      const bigLead = await wonLead('E2E Big Order');
      const big = await http().post('/api/v1/sales-orders').set(as(sales))
        .send({ leadId: bigLead, quantity: 99999, totalAmount: 100 }).expect(201);
      created.orderIds.push(big.body.id);
      const short = await http().post(`/api/v1/sales-orders/${big.body.id}/deliver`).set(as(admin)).expect(400);
      expect(short.body.message).toMatch(/Not enough stock/);
    });

    it('stock: supervisor adds production; sales cannot; stock never goes negative', async () => {
      const list = await http().get('/api/v1/stock').set(as(supervisor)).expect(200);
      const bio = list.body.items.find((p: { sku: string }) => p.sku === 'SUMP-5000');
      await http().get('/api/v1/stock').set(as(sales)).expect(403);

      const added = await http().post(`/api/v1/stock/${bio.id}/movements`).set(as(supervisor))
        .send({ change: 5, reason: 'PRODUCTION', note: 'e2e' }).expect(201);
      expect(added.body.quantityOnHand).toBe(bio.quantityOnHand + 5);
      await http().post(`/api/v1/stock/${bio.id}/movements`).set(as(supervisor))
        .send({ change: -100000, reason: 'ADJUSTMENT', note: 'e2e' }).expect(400);
    });

    it('vendors: outstanding = purchases - payments, oldest bill first; sales has no access', async () => {
      await http().get('/api/v1/vendors').set(as(sales)).expect(403);
      const vendor = await http().post('/api/v1/vendors').set(as(admin))
        .send({ name: 'E2E Vendor', category: 'OTHER' }).expect(201);
      created.vendorIds.push(vendor.body.id);

      await http().post(`/api/v1/vendors/${vendor.body.id}/purchases`).set(as(admin))
        .send({ item: 'Old bill', amount: 1000, purchaseDate: '2020-01-01', dueDate: '2020-01-31' }).expect(201);
      await http().post(`/api/v1/vendors/${vendor.body.id}/purchases`).set(as(admin))
        .send({ item: 'New bill', amount: 500, purchaseDate: today, dueDate: '2099-01-01' }).expect(201);
      const paid = await http().post(`/api/v1/vendors/${vendor.body.id}/payments`).set(as(admin))
        .send({ amount: 600, paidOn: today, mode: 'CASH' }).expect(201);

      expect(paid.body.outstanding).toBe('900.00');
      expect(paid.body.overdue).toBe('400.00'); // 600 paid went to the older bill first
      await http().post(`/api/v1/vendors/${vendor.body.id}/payments`).set(as(admin))
        .send({ amount: 900.01, paidOn: today, mode: 'CASH' }).expect(400);
    });
  });

  describe('Installations, service and site visits', () => {
    const tokens: Record<string, string> = {};
    const created = {
      leadIds: [] as string[], orderIds: [] as string[], installationIds: [] as string[],
      jobIds: [] as string[], visitIds: [] as string[], tagIds: [] as string[],
    };
    const stockBefore = new Map<string, number>();
    const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
    const http = () => request(app.getHttpServer());
    const today = new Date().toISOString().slice(0, 10);

    async function prisma() {
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      return app.get(PrismaService);
    }

    beforeAll(async () => {
      for (const [who, email] of Object.entries({
        admin: 'admin@precon.local', sales: 'sales@precon.local', sales2: 'sales2@precon.local',
        supervisor: 'supervisor@precon.local', tech: 'tech@precon.local', telecaller: 'telecaller@precon.local',
      })) {
        tokens[who] = (await login(email)).body.accessToken;
      }
      for (const p of await (await prisma()).product.findMany()) stockBefore.set(p.id, p.quantityOnHand);

      // A fresh won lead + order owned by Suresh (sales).
      const lead = await http().post('/api/v1/leads').set(as('sales'))
        .send({ name: 'E2E Install Customer', phone: '9000033333', source: 'MANUAL', productInterest: 'MICROBES', status: 'WON' })
        .expect(201);
      created.leadIds.push(lead.body.id);
      const order = await http().post('/api/v1/sales-orders').set(as('sales'))
        .send({ leadId: lead.body.id, quantity: 1, totalAmount: 1000 }).expect(201);
      created.orderIds.push(order.body.id);
    });

    afterAll(async () => {
      const db = await prisma();
      await db.siteVisit.deleteMany({ where: { id: { in: created.visitIds } } });
      await db.siteVisitTag.deleteMany({ where: { id: { in: created.tagIds } } });
      await db.serviceJob.deleteMany({ where: { id: { in: created.jobIds } } });
      await db.installation.deleteMany({ where: { id: { in: created.installationIds } } });
      await db.stockMovement.deleteMany({ where: { salesOrderId: { in: created.orderIds } } });
      await db.salesOrder.deleteMany({ where: { id: { in: created.orderIds } } });
      await db.lead.deleteMany({ where: { id: { in: created.leadIds } } });
      for (const [id, qty] of stockBefore) await db.product.update({ where: { id }, data: { quantityOnHand: qty } });
    });

    it('supervisor schedules, starts and completes; completing delivers the order and reduces stock', async () => {
      const orderId = created.orderIds[0];
      const body = { salesOrderId: orderId, scheduledDate: today, siteAddress: 'E2E site, Coimbatore' };
      await http().post('/api/v1/installations').set(as('sales')).send(body).expect(403);

      const inst = await http().post('/api/v1/installations').set(as('supervisor')).send(body).expect(201);
      created.installationIds.push(inst.body.id);
      expect(inst.body.status).toBe('SCHEDULED');
      await http().post('/api/v1/installations').set(as('supervisor')).send(body).expect(409);

      // No service jobs before completion.
      await http().post('/api/v1/service-jobs').set(as('admin'))
        .send({ installationId: inst.body.id, type: 'COMPLAINT', description: 'Too early' }).expect(400);

      await http().post(`/api/v1/installations/${inst.body.id}/start`).set(as('supervisor')).expect(200);
      const db = await prisma();
      const microbes = await db.product.findUniqueOrThrow({ where: { sku: 'MICROBES' } });
      const done = await http().post(`/api/v1/installations/${inst.body.id}/complete`).set(as('supervisor'))
        .send({ completionNotes: 'e2e' }).expect(200);
      expect(done.body.status).toBe('COMPLETED');
      expect(done.body.salesOrder.status).toBe('DELIVERED');
      const after = await db.product.findUniqueOrThrow({ where: { id: microbes.id } });
      expect(after.quantityOnHand).toBe(microbes.quantityOnHand - 1);
      await http().patch(`/api/v1/installations/${inst.body.id}`).set(as('supervisor'))
        .send({ teamName: 'x' }).expect(400);
    });

    it('service jobs: eligible after completion; scoped to the seller and the assignee', async () => {
      const installationId = created.installationIds[0];
      const assignees = await http().get('/api/v1/service-jobs/assignees').set(as('admin')).expect(200);
      const ravi = assignees.body.find((u: { fullName: string }) => u.fullName === 'Ravi Technician');

      const job = await http().post('/api/v1/service-jobs').set(as('admin'))
        .send({ installationId, type: 'COMPLAINT', priority: 'HIGH', description: 'E2E leak report', assignedToId: ravi.id })
        .expect(201);
      created.jobIds.push(job.body.id);
      expect(job.body.jobNumberLabel).toMatch(/^SJ-/);

      await http().get(`/api/v1/service-jobs/${job.body.id}`).set(as('sales')).expect(403); // sales preset has no service tags
      await http().get(`/api/v1/service-jobs/${job.body.id}`).set(as('tech')).expect(200); // supervisor preset
      await http().get('/api/v1/service-jobs').set(as('supervisor')).expect(200); // sees every job (read_all)
      await http().patch(`/api/v1/service-jobs/${job.body.id}`).set(as('sales')).send({ status: 'RESOLVED' }).expect(403);

      const resolved = await http().patch(`/api/v1/service-jobs/${job.body.id}`).set(as('tech'))
        .send({ status: 'RESOLVED', resolutionNotes: 'Fixed' }).expect(200);
      expect(resolved.body.resolvedAt).not.toBeNull();
      const reopened = await http().patch(`/api/v1/service-jobs/${job.body.id}`).set(as('tech'))
        .send({ status: 'IN_PROGRESS' }).expect(200);
      expect(reopened.body.resolvedAt).toBeNull();
    });

    it('service follow-ups: overdue shows up, then completes', async () => {
      const jobId = created.jobIds[0];
      const past = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const fu = await http().post(`/api/v1/service-jobs/${jobId}/follow-ups`).set(as('tech'))
        .send({ scheduledAt: past, note: 'E2E call' }).expect(201);
      const overdue = await http().get('/api/v1/service-follow-ups?state=overdue').set(as('supervisor')).expect(200);
      expect(overdue.body.some((f: { id: string }) => f.id === fu.body.id)).toBe(true);
      await http().post(`/api/v1/service-follow-ups/${fu.body.id}/complete`).set(as('sales2'))
        .send({ outcome: 'FIXED' }).expect(403); // no service.write
      const done = await http().post(`/api/v1/service-follow-ups/${fu.body.id}/complete`).set(as('tech'))
        .send({ outcome: 'FIXED' }).expect(200);
      expect(done.body.completedAt).not.toBeNull();
    });

    it('site visits: admin manages tags; supervisor records visits; retired tags rules', async () => {
      await http().post('/api/v1/site-visit-tags').set(as('supervisor')).send({ name: 'e2e-tag' }).expect(403);
      const tag = await http().post('/api/v1/site-visit-tags').set(as('admin'))
        .send({ name: 'E2E Tag', color: 'teal' }).expect(201);
      created.tagIds.push(tag.body.id);
      expect(tag.body.name).toBe('e2e-tag');
      await http().post('/api/v1/site-visit-tags').set(as('admin')).send({ name: 'e2e-tag' }).expect(409);

      const visit = await http().post('/api/v1/site-visits').set(as('supervisor')).send({
        visitDate: today, customerName: 'E2E Customer', siteAddress: 'E2E site, Coimbatore',
        purpose: 'e2e visit', tagIds: [tag.body.id], installationId: created.installationIds[0],
      }).expect(201);
      created.visitIds.push(visit.body.id);
      expect(visit.body.tags.map((t: { name: string }) => t.name)).toEqual(['e2e-tag']);
      expect(visit.body.person.fullName).toBe('Farid Supervisor');
      await http().get('/api/v1/site-visits').set(as('sales')).expect(200); // sales preset includes site visits
      await http().get('/api/v1/site-visits').set(as('telecaller')).expect(403);

      const filtered = await http().get(`/api/v1/site-visits?tagId=${tag.body.id}`).set(as('supervisor')).expect(200);
      expect(filtered.body).toHaveLength(1);

      await http().delete(`/api/v1/site-visit-tags/${tag.body.id}`).set(as('admin')).expect(409); // in use
      await http().patch(`/api/v1/site-visit-tags/${tag.body.id}`).set(as('admin')).send({ isActive: false }).expect(200);
      await http().post('/api/v1/site-visits').set(as('supervisor')).send({
        visitDate: today, customerName: 'E2E', siteAddress: 'E2E site 2', purpose: 'retired tag', tagIds: [tag.body.id],
      }).expect(400);
      // Keeping a retired tag on the visit that already has it is fine.
      await http().patch(`/api/v1/site-visits/${visit.body.id}`).set(as('supervisor'))
        .send({ purpose: 'edited', tagIds: [tag.body.id] }).expect(200);

      const unused = await http().post('/api/v1/site-visit-tags').set(as('admin')).send({ name: 'e2e-unused' }).expect(201);
      await http().delete(`/api/v1/site-visit-tags/${unused.body.id}`).set(as('admin')).expect(204);
    });
  });

  describe('HR: leave, holidays, LOP, allowances', () => {
    const tokens: Record<string, string> = {};
    const ids: Record<string, string> = {};
    const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
    const http = () => request(app.getHttpServer());
    const today = new Date().toISOString().slice(0, 10);
    // Far-future dates so nothing collides with seed data. 2027-03-01 is a Monday.
    const MON = '2027-03-01';
    const WED = '2027-03-03';

    async function prisma() {
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      return app.get(PrismaService);
    }

    beforeAll(async () => {
      for (const [who, email] of Object.entries({
        admin: 'admin@precon.local', sales: 'sales@precon.local', telecaller: 'telecaller@precon.local', tech: 'tech@precon.local',
      })) {
        const res = await login(email);
        tokens[who] = res.body.accessToken;
        ids[who] = res.body.user.id;
      }
    });

    afterAll(async () => {
      const db = await prisma();
      await db.leaveApplication.deleteMany({ where: { reason: { startsWith: 'e2e' } } });
      await db.absence.deleteMany({ where: { note: 'e2e' } });
      await db.holiday.deleteMany({ where: { name: 'e2e holiday' } });
      await db.allowance.deleteMany({ where: { description: { startsWith: 'e2e' } } });
    });

    it('apply: working days only, no overlaps, paid balance enforced', async () => {
      const leave = await http().post('/api/v1/leave').set(as('sales'))
        .send({ type: 'CASUAL', startDate: MON, endDate: WED, reason: 'e2e trip' }).expect(201);
      expect(leave.body.days).toBe(3);
      expect(leave.body.status).toBe('PENDING');
      ids.leave = leave.body.id;

      await http().post('/api/v1/leave').set(as('sales'))
        .send({ type: 'SICK', startDate: WED, endDate: WED, reason: 'e2e overlap' }).expect(409);
      await http().post('/api/v1/leave').set(as('sales'))
        .send({ type: 'CASUAL', startDate: '2027-03-07', endDate: '2027-03-07', reason: 'e2e sunday' }).expect(400);
      const tooMuch = await http().post('/api/v1/leave').set(as('sales'))
        .send({ type: 'CASUAL', startDate: '2027-05-03', endDate: '2027-05-18', reason: 'e2e too long' }).expect(400);
      expect(tooMuch.body.message).toMatch(/unpaid/);

      // Adding a holiday inside the leave shrinks its day count (days are always computed).
      await http().post('/api/v1/holidays').set(as('sales')).send({ date: '2027-03-02', name: 'e2e holiday' }).expect(403);
      const h = await http().post('/api/v1/holidays').set(as('admin')).send({ date: '2027-03-02', name: 'e2e holiday' }).expect(201);
      const mine = await http().get('/api/v1/leave/mine?year=2027').set(as('sales')).expect(200);
      expect(mine.body.find((l: { id: string }) => l.id === ids.leave).days).toBe(2);
      await http().delete(`/api/v1/holidays/${h.body.id}`).set(as('admin')).expect(204);
    });

    it('decide: only approvers, never your own, reject needs a reason; balance updates', async () => {
      await http().post(`/api/v1/leave/${ids.leave}/approve`).set(as('sales')).send({}).expect(403);
      await http().post(`/api/v1/leave/${ids.leave}/reject`).set(as('admin')).send({}).expect(400);
      const ok = await http().post(`/api/v1/leave/${ids.leave}/approve`).set(as('admin')).send({ note: 'Enjoy' }).expect(200);
      expect(ok.body.status).toBe('APPROVED');
      await http().post(`/api/v1/leave/${ids.leave}/approve`).set(as('admin')).send({}).expect(400); // not pending

      const bal = await http().get('/api/v1/leave/balance?year=2027').set(as('sales')).expect(200);
      expect(bal.body.paid.find((p: { type: string }) => p.type === 'CASUAL').taken).toBe(3);

      const own = await http().post('/api/v1/leave').set(as('admin'))
        .send({ type: 'CASUAL', startDate: MON, endDate: MON, reason: 'e2e admin own' }).expect(201);
      await http().post(`/api/v1/leave/${own.body.id}/approve`).set(as('admin')).send({}).expect(403);

      // Approved but not started yet: the employee can still withdraw it.
      const cancelled = await http().post(`/api/v1/leave/${ids.leave}/cancel`).set(as('sales')).expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
    });

    it('LOP: approved unpaid leave and recorded absences count; paid leave does not', async () => {
      const unpaid = await http().post('/api/v1/leave').set(as('telecaller'))
        .send({ type: 'UNPAID', startDate: '2027-04-05', endDate: '2027-04-05', reason: 'e2e unpaid' }).expect(201);
      await http().post(`/api/v1/leave/${unpaid.body.id}/approve`).set(as('admin')).send({}).expect(200);
      const summary = await http().get(`/api/v1/lop/summary?month=2027-04&userId=${ids.telecaller}`).set(as('admin')).expect(200);
      expect(summary.body.rows[0].unpaidLeaveDays).toBe(1);
      expect(summary.body.rows[0].lopDays).toBe(1);
      expect(summary.body.rows[0].paidDays).toBe(summary.body.workingDays - 1);
      await http().get('/api/v1/lop/summary?month=2027-04').set(as('telecaller')).expect(403);
      const mine = await http().get('/api/v1/leave/lop/mine?month=2027-04').set(as('telecaller')).expect(200);
      expect(mine.body.row.lopDays).toBe(1);

      // Absences: past working days only, not over approved leave, one per day.
      await http().post('/api/v1/lop/absences').set(as('admin'))
        .send({ userId: ids.telecaller, date: '2099-01-05', note: 'e2e' }).expect(400); // future
      const lastSunday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); })();
      await http().post('/api/v1/lop/absences').set(as('admin'))
        .send({ userId: ids.telecaller, date: lastSunday, note: 'e2e' }).expect(400); // weekly off
      await http().post('/api/v1/lop/absences').set(as('sales'))
        .send({ userId: ids.telecaller, date: '2026-09-01', note: 'e2e' }).expect(403);
      const absence = await http().post('/api/v1/lop/absences').set(as('admin'))
        .send({ userId: ids.telecaller, date: '2026-09-01', note: 'e2e' }).expect(201);
      await http().post('/api/v1/lop/absences').set(as('admin'))
        .send({ userId: ids.telecaller, date: '2026-09-01', note: 'e2e' }).expect(409);
      const sept = await http().get(`/api/v1/lop/summary?month=2026-09&userId=${ids.telecaller}`).set(as('admin')).expect(200);
      expect(sept.body.rows[0].absentWithoutApproval).toBe(1);
      await http().delete(`/api/v1/lop/absences/${absence.body.id}`).set(as('admin')).expect(204);
    });

    it('allowances: claims are pending until approved; scope and links enforced', async () => {
      const claim = await http().post('/api/v1/allowances').set(as('sales'))
        .send({ type: 'TRAVEL', amount: 250.5, date: today, description: 'e2e bus fare' }).expect(201);
      expect(claim.body.status).toBe('PENDING');
      expect(claim.body.amount).toBe('250.50');

      await http().post('/api/v1/allowances').set(as('sales'))
        .send({ userId: ids.tech, type: 'FOOD', amount: 10, date: today, description: 'e2e for someone else' }).expect(403);
      const techVisit = await (await prisma()).siteVisit.findFirst({ where: { personId: ids.tech }, select: { id: true } });
      await http().post('/api/v1/allowances').set(as('sales'))
        .send({ type: 'SITE', amount: 10, date: today, description: 'e2e not my visit', siteVisitId: techVisit!.id }).expect(400);
      await http().post('/api/v1/allowances').set(as('sales'))
        .send({ type: 'FOOD', amount: 10, date: '2099-01-01', description: 'e2e future' }).expect(400);

      await http().post(`/api/v1/allowances/${claim.body.id}/approve`).set(as('sales')).send({}).expect(403);
      const approved = await http().post(`/api/v1/allowances/${claim.body.id}/approve`).set(as('admin')).send({}).expect(200);
      expect(approved.body.status).toBe('APPROVED');
      await http().delete(`/api/v1/allowances/${claim.body.id}`).set(as('sales')).expect(400); // no longer pending

      const added = await http().post('/api/v1/allowances').set(as('admin'))
        .send({ userId: ids.tech, type: 'SITE', amount: 300, date: today, description: 'e2e added by admin', siteVisitId: techVisit!.id })
        .expect(201);
      expect(added.body.status).toBe('APPROVED');
      await http().post(`/api/v1/allowances/${added.body.id}/reject`).set(as('admin')).send({ note: 'x' }).expect(400); // not pending

      const month = today.slice(0, 7);
      const mine = await http().get(`/api/v1/allowances/summary?month=${month}`).set(as('sales')).expect(200);
      expect(mine.body.rows.every((r: { employee: { id: string } }) => r.employee.id === ids.sales)).toBe(true);
      await http().get(`/api/v1/allowances?userId=${ids.tech}`).set(as('sales')).expect(403);
    });
  });

  describe('Users: role presets', () => {
    const email = 'e2e.newuser@precon.local';
    let admin: string;
    let sales: string;
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const http = () => request(app.getHttpServer());

    beforeAll(async () => {
      admin = (await login('admin@precon.local')).body.accessToken;
      sales = (await login('sales@precon.local')).body.accessToken;
    });

    afterAll(async () => {
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      await app.get(PrismaService).user.deleteMany({ where: { email } });
    });

    it('a new user gets exactly their role preset; changing role swaps the preset and clears custom tags', async () => {
      await http().post('/api/v1/users').set(as(sales))
        .send({ fullName: 'E2E New', email, roleKey: 'telecaller', password: 'secret123' }).expect(403);
      const created = await http().post('/api/v1/users').set(as(admin))
        .send({ fullName: 'E2E New', email: 'E2E.NewUser@precon.local', roleKey: 'telecaller', password: 'secret123' })
        .expect(201);
      expect(created.body.email).toBe(email);
      await http().post('/api/v1/users').set(as(admin))
        .send({ fullName: 'Dup', email, roleKey: 'sales', password: 'secret123' }).expect(409);

      const loginAsNew = () => http().post('/api/v1/auth/login').send({ email, password: 'secret123' });
      const asTelecaller = (await loginAsNew().expect(200)).body.user;
      expect(asTelecaller.permissions).toEqual(
        ['allowances.claim', 'allowances.read', 'followups.write', 'leads.auto_assign', 'leads.qualify', 'leads.read', 'leave.apply', 'leave.read', 'reports.view'],
      );

      // Give a custom tag, then change role: the custom tag is cleared, preset applies.
      await http().put(`/api/v1/users/${created.body.id}/permissions`).set(as(admin))
        .send({ grant: ['stock.read'], revoke: [] }).expect(200);
      const changed = await http().patch(`/api/v1/users/${created.body.id}`).set(as(admin))
        .send({ roleKey: 'factory_supervisor' }).expect(200);
      expect(changed.body.role.key).toBe('factory_supervisor');
      expect(changed.body.customTagCount).toBe(0);
      const asSupervisor = (await loginAsNew().expect(200)).body.user;
      expect(asSupervisor.permissions).toContain('installations.write');
      expect(asSupervisor.permissions).not.toContain('leads.read');

      // Deactivate: can no longer sign in.
      await http().patch(`/api/v1/users/${created.body.id}`).set(as(admin)).send({ isActive: false }).expect(200);
      await loginAsNew().expect(401);
    });

    it("admins can't change their own role or deactivate themselves", async () => {
      const me = (await http().get('/api/v1/auth/me').set(as(admin))).body;
      await http().patch(`/api/v1/users/${me.id}`).set(as(admin)).send({ roleKey: 'sales' }).expect(400);
      await http().patch(`/api/v1/users/${me.id}`).set(as(admin)).send({ isActive: false }).expect(400);
      await http().patch(`/api/v1/users/${me.id}`).set(as(admin)).send({ fullName: 'Asha Admin' }).expect(200);
    });
  });

  describe('Lead intake: import, public API, Meta webhook', () => {
    let admin: string;
    let sales: string;
    let telecaller: string;
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const http = () => request(app.getHttpServer());
    const savedEnv = { ...process.env };

    async function prisma() {
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      return app.get(PrismaService);
    }

    beforeAll(async () => {
      admin = (await login('admin@precon.local')).body.accessToken;
      sales = (await login('sales@precon.local')).body.accessToken;
      telecaller = (await login('telecaller@precon.local')).body.accessToken;
      process.env.META_VERIFY_TOKEN = 'e2e-verify';
      process.env.META_APP_SECRET = 'e2e-secret';
    });

    afterAll(async () => {
      process.env.META_VERIFY_TOKEN = savedEnv.META_VERIFY_TOKEN;
      process.env.META_APP_SECRET = savedEnv.META_APP_SECRET;
      const db = await prisma();
      await db.lead.deleteMany({
        where: {
          OR: [
            { sourceDetail: { startsWith: 'Import: e2e' } },
            { sourceDetail: { startsWith: 'API key: E2E' } },
            { externalRef: { startsWith: 'meta:leadgen:e2e-' } },
          ],
        },
      });
      await db.apiKey.deleteMany({ where: { name: { startsWith: 'E2E' } } });
    });

    it('import: creates valid rows, skips duplicates, reports invalid rows with reasons', async () => {
      const csv = [
        'Name,Phone,City,Product,Sump Size,Source,Assigned Salesperson,Notes,Extra column',
        'E2E Import Sump,+91 90000 81001,Salem,Sump,"10,000 L",Facebook,sales@precon.local,first,x',
        'E2E Import Microbes,9000081002,Erode,microbes,,referral,,,',
        'E2E Dup Of Seed,9840012345,Coimbatore,Sump,,,,,', // Ramesh Kumar's phone from the seed
        'E2E Dup In File,900-008-1001,Salem,Sump,,,,,', // same as row 2
        'E2E Bad Phone,12345,Salem,Sump,,,,,',
        'E2E Bad Size,9000081003,Salem,Sump,7000,,,,',
        'Example - Ravi Kumar,9000081004,Coimbatore,Sump,10000,Meta,,,',
      ].join('\n');
      const res = await http().post('/api/v1/leads/import').set(as(admin))
        .attach('file', Buffer.from(csv), 'e2e-leads.csv').expect(200);
      expect(res.body.totalRows).toBe(7);
      expect(res.body.created).toBe(2);
      expect(res.body.duplicates.map((d: { row: number }) => d.row)).toEqual([4, 5]);
      expect(res.body.failed.map((f: { row: number }) => f.row)).toEqual([6, 7, 8]);
      expect(res.body.failed[1].errors[0]).toMatch(/Sump size/);
      expect(res.body.ignoredColumns).toEqual(['Extra column']);

      const db = await prisma();
      const sump = await db.lead.findFirstOrThrow({ where: { name: 'E2E Import Sump' }, include: { assignedTo: true } });
      expect(sump.source).toBe('META');
      expect(sump.sumpSizeLitres).toBe(10000);
      expect(sump.assignedTo?.email).toBe('sales@precon.local');
    });

    it("import by a salesperson: blank rows go round-robin, own email keeps it, others can't be named", async () => {
      const csv = 'name,phone,product,assigned salesperson\n' +
        'E2E Sales Row,9000081010,Sump,\n' +
        'E2E Sales Mine,9000081012,Sump,sales@precon.local\n' +
        'E2E Sales Other,9000081011,Sump,Priya Sales\n';
      const res = await http().post('/api/v1/leads/import').set(as(sales))
        .attach('file', Buffer.from(csv), 'e2e-sales.csv').expect(200);
      expect(res.body.created).toBe(2);
      expect(res.body.failed[0].errors[0]).toMatch(/someone else/);
      const db = await prisma();
      const roundRobin = await db.lead.findFirstOrThrow({ where: { name: 'E2E Sales Row' }, include: { assignedTo: { include: { role: true } } } });
      expect(roundRobin.autoAssigned).toBe(true);
      expect(roundRobin.assignedTo?.role.key).toBe('telecaller');
      const mine = await db.lead.findFirstOrThrow({ where: { name: 'E2E Sales Mine' }, include: { assignedTo: true } });
      expect(mine.assignedTo?.email).toBe('sales@precon.local');
      expect(mine.autoAssigned).toBe(false);
    });

    it('import: bad files import nothing; telecaller (no leads.write) is refused', async () => {
      const wrongType = await http().post('/api/v1/leads/import').set(as(admin))
        .attach('file', Buffer.from('hello'), 'e2e-notes.txt').expect(400);
      expect(wrongType.body.message).toMatch(/\.csv or \.xlsx/);
      const noPhone = await http().post('/api/v1/leads/import').set(as(admin))
        .attach('file', Buffer.from('name,product\nE2E No Phone,Sump\n'), 'e2e-nophone.csv').expect(400);
      expect(noPhone.body.message).toMatch(/Missing required column\(s\): phone/);
      await http().post('/api/v1/leads/import').set(as(admin))
        .attach('file', Buffer.from('not a spreadsheet'), 'e2e-broken.xlsx').expect(400);
      await http().post('/api/v1/leads/import').set(as(telecaller))
        .attach('file', Buffer.from('name,phone,product\nX,9000081020,Sump\n'), 'e2e-t.csv').expect(403);
    });

    it('import: reads .xlsx files (template layout)', async () => {
      const tpl = await http().get('/api/v1/leads/import/template?format=xlsx').set(as(admin))
        .buffer(true).parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        }).expect(200);
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(tpl.body);
      const ws = wb.getWorksheet('Leads')!;
      ws.spliceRows(2, 2); // remove the example rows, as the user would
      ws.addRow(['E2E Xlsx Lead', 9000081030, 'Karur', 'Sump', 6000, 'Website', '', 'from excel']);
      const file = Buffer.from(await wb.xlsx.writeBuffer());
      const res = await http().post('/api/v1/leads/import').set(as(admin)).attach('file', file, 'e2e-leads.xlsx').expect(200);
      expect(res.body.created).toBe(1);
      const lead = await (await prisma()).lead.findFirstOrThrow({ where: { name: 'E2E Xlsx Lead' } });
      expect(lead.phone).toBe('9000081030');
      expect(lead.sumpSizeLitres).toBe(6000);
    });

    it('API keys: admin-only; full key shown once; revoked keys stop working', async () => {
      await http().get('/api/v1/api-keys').set(as(sales)).expect(403);
      const created = await http().post('/api/v1/api-keys').set(as(admin)).send({ name: 'E2E Partner' }).expect(201);
      const key: string = created.body.key;
      expect(key).toMatch(/^precon_/);
      const list = await http().get('/api/v1/api-keys').set(as(admin)).expect(200);
      const row = list.body.find((k: { id: string }) => k.id === created.body.id);
      expect(row.key).toBeUndefined();
      expect(row.keyHash).toBeUndefined();
      expect(key.startsWith(row.prefix)).toBe(true);

      const body = { name: 'E2E Api Lead', phone: '9000081040', product: 'SUMP', sumpSizeLitres: 5000, externalId: 'e2e-1' };
      const first = await http().post('/api/v1/public/leads').set('X-API-Key', key).send(body).expect(201);
      expect(first.body.status).toBe('created');
      const lead = await (await prisma()).lead.findUniqueOrThrow({ where: { id: first.body.leadId } });
      expect(lead.source).toBe('API');
      expect(lead.sourceDetail).toBe('API key: E2E Partner');

      const samePhone = await http().post('/api/v1/public/leads').set('X-API-Key', key)
        .send({ ...body, externalId: 'e2e-2', phone: '+91 9000081040' }).expect(200);
      expect(samePhone.body).toMatchObject({ status: 'duplicate', reason: 'phone' });
      const sameId = await http().post('/api/v1/public/leads').set('X-API-Key', key)
        .send({ ...body, phone: '9000081041' }).expect(200);
      expect(sameId.body).toMatchObject({ status: 'duplicate', reason: 'externalId' });

      await http().post('/api/v1/public/leads').send(body).expect(401);
      await http().post('/api/v1/public/leads').set('X-API-Key', 'precon_wrongwrongwrongwrong').send(body).expect(401);
      await http().post(`/api/v1/api-keys/${created.body.id}/revoke`).set(as(admin)).expect(200);
      await http().post('/api/v1/public/leads').set('X-API-Key', key).send({ ...body, phone: '9000081042' }).expect(401);
    });

    it('Meta webhook: verify handshake, signed leadgen creates a lead once, bad signatures refused', async () => {
      const ok = await http().get('/api/v1/webhooks/meta')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'e2e-verify', 'hub.challenge': '424242' }).expect(200);
      expect(ok.text).toBe('424242');
      await http().get('/api/v1/webhooks/meta')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' }).expect(403);

      const { createHmac } = await import('node:crypto');
      const payload = JSON.stringify({
        object: 'page',
        entry: [{ id: 'p', time: 1, changes: [{ field: 'leadgen', value: {
          leadgen_id: 'e2e-lg-1', form_id: 'f1',
          field_data: [
            { name: 'full_name', values: ['E2E Meta Lead'] },
            { name: 'phone_number', values: ['+919000081050'] },
            { name: 'sump_size', values: ['12000'] },
          ],
        } }] }],
      });
      const sign = (body: string) => 'sha256=' + createHmac('sha256', 'e2e-secret').update(body).digest('hex');
      const send = (sig: string) => http().post('/api/v1/webhooks/meta')
        .set('Content-Type', 'application/json').set('X-Hub-Signature-256', sig).send(payload);

      const first = await send(sign(payload)).expect(200);
      expect(first.body.results[0].status).toBe('created');
      const again = await send(sign(payload)).expect(200);
      expect(again.body.results[0].status).toBe('duplicate');
      await send('sha256=' + '0'.repeat(64)).expect(403);

      const lead = await (await prisma()).lead.findUniqueOrThrow({ where: { externalRef: 'meta:leadgen:e2e-lg-1' } });
      // A size answer alone means a sump; the lead goes to a telecaller in the rotation.
      expect(lead).toMatchObject({ source: 'META', productInterest: 'SUMP', sumpSizeLitres: 12000, name: 'E2E Meta Lead', autoAssigned: true });
      expect(lead.assignedToId).not.toBeNull();

      // Not configured: answer 503, don't crash.
      delete process.env.META_VERIFY_TOKEN;
      delete process.env.META_APP_SECRET;
      await http().get('/api/v1/webhooks/meta').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '1' }).expect(503);
      await send(sign(payload)).expect(503);
      await http().get('/api/v1/health').expect(200);
    });

    it("telecallers qualify their own leads (leads.qualify) but can't change phone/source, touch others' leads, create or import", async () => {
      const db = await prisma();
      const tara = await db.user.findUniqueOrThrow({ where: { email: 'telecaller@precon.local' } });
      const created = await http().post('/api/v1/leads').set(as(admin))
        .send({ name: 'E2E Qualify', phone: '9000083001', source: 'META', assignedToId: tara.id }).expect(201);
      const id = created.body.id;
      const other = await http().post('/api/v1/leads').set(as(admin))
        .send({ name: 'E2E Qualify Other', phone: '9000083002', source: 'META' }).expect(201);
      try {
        expect(created.body.productInterest).toBeNull();
        // After the call: fill in what the customer said and move it along. Same phone/source sent back is fine.
        const updated = await http().patch(`/api/v1/leads/${id}`).set(as(telecaller)).send({
          name: 'E2E Qualify Ravi', phone: '9000083001', source: 'META', city: 'Salem',
          productInterest: 'SUMP', sumpSizeLitres: 10000, status: 'QUALIFIED', notes: 'Needs it in 2 weeks',
        }).expect(200);
        expect(updated.body).toMatchObject({ name: 'E2E Qualify Ravi', city: 'Salem', productInterest: 'SUMP', sumpSizeLitres: 10000, status: 'QUALIFIED' });

        const phone = await http().patch(`/api/v1/leads/${id}`).set(as(telecaller)).send({ phone: '9000083009' }).expect(403);
        expect(phone.body.message).toMatch(/phone/);
        await http().patch(`/api/v1/leads/${id}`).set(as(telecaller)).send({ source: 'WEBSITE' }).expect(403);
        await http().patch(`/api/v1/leads/${id}`).set(as(telecaller)).send({ assignedToId: null }).expect(403);
        await http().patch(`/api/v1/leads/${other.body.id}`).set(as(telecaller)).send({ city: 'X' }).expect(404);
        await http().post('/api/v1/leads').set(as(telecaller)).send({ name: 'E2E No', phone: '9000083003', source: 'MANUAL' }).expect(403);
        // A salesperson (leads.write) can still change the phone on their own lead.
        const salesUser = await db.user.findUniqueOrThrow({ where: { email: 'sales@precon.local' } });
        await http().patch(`/api/v1/leads/${id}`).set(as(admin)).send({ assignedToId: salesUser.id }).expect(200);
        await http().patch(`/api/v1/leads/${id}`).set(as(sales)).send({ phone: '9000083004' }).expect(200);
      } finally {
        await db.lead.deleteMany({ where: { id: { in: [id, other.body.id] } } });
      }
    });

    describe('round-robin assignment', () => {
      type Member = { id: string; fullName: string; autoAssignEnabled: boolean };
      let members: Member[] = [];
      const distribution = async () => (await http().get('/api/v1/lead-assignment').set(as(admin)).expect(200)).body;
      const csvOf = (prefix: string, phones: string[]) =>
        Buffer.from('full_name,phone_number\n' + phones.map((p, i) => `${prefix} ${i + 1},p:+91${p}`).join('\n') + '\n');

      beforeAll(async () => {
        members = (await distribution()).members;
        // Start from a known state: every telecaller switched on.
        for (const m of members) await http().patch(`/api/v1/lead-assignment/members/${m.id}`).set(as(admin)).send({ enabled: true }).expect(200);
      });
      afterAll(async () => {
        for (const m of members) {
          await http().patch(`/api/v1/lead-assignment/members/${m.id}`).set(as(admin)).send({ enabled: m.autoAssignEnabled });
        }
      });

      it('the rotation is the three seeded telecallers (not the admin)', () => {
        expect(members.map((m) => m.fullName).sort()).toEqual(['Arjun Telecaller', 'Kavya Telecaller', 'Tara Telecaller']);
      });

      it('a name+phone Meta export splits evenly, in turn, and the turn carries over to the API', async () => {
        const before = await distribution();
        const phones = Array.from({ length: 9 }, (_, i) => String(9000082001 + i));
        const res = await http().post('/api/v1/leads/import').set(as(admin)).field('defaultSource', 'META')
          .attach('file', csvOf('E2E RR', phones), 'e2e-rr.csv').expect(200);
        expect(res.body.created).toBe(9);
        expect(res.body.ignoredColumns).toEqual([]);
        expect(res.body.assignments.map((a: { count: number }) => a.count)).toEqual([3, 3, 3]);
        // In turn: rows 1-3 go to three different people, starting with whoever was next.
        const order = res.body.createdRows.map((r: { assignedTo: string }) => r.assignedTo);
        expect(order[0]).toBe(before.nextUp.fullName);
        expect(new Set(order.slice(0, 3)).size).toBe(3);
        expect(order.slice(3, 6)).toEqual(order.slice(0, 3));

        const db = await prisma();
        const imported = await db.lead.findFirstOrThrow({ where: { name: 'E2E RR 1' } });
        expect(imported).toMatchObject({ source: 'META', productInterest: null, phone: '+919000082001', autoAssigned: true });

        // The next lead, from the API, continues the same rotation.
        const key = (await http().post('/api/v1/api-keys').set(as(admin)).send({ name: 'E2E Rotation' }).expect(201)).body.key;
        const api = await http().post('/api/v1/public/leads').set('X-API-Key', key)
          .send({ name: 'E2E RR Api', phone: '9000082010' }).expect(201);
        expect(api.body.assignedTo).toBe(order[0]);

        const after = await distribution();
        expect(after.total - before.total).toBe(10);
        for (const m of after.members) {
          const was = before.members.find((b: { id: string }) => b.id === m.id)!;
          expect([3, 4]).toContain(m.leads - was.leads);
        }
      });

      it('duplicates use no turn; a switched-off telecaller is skipped; reassigning by hand clears the flag', async () => {
        const off = members[0];
        await http().patch(`/api/v1/lead-assignment/members/${off.id}`).set(as(admin)).send({ enabled: false }).expect(200);
        try {
          const phones = ['9000082101', '9000082102', '9000082101', '9840012345', '9000082103', '9000082104'];
          const res = await http().post('/api/v1/leads/import').set(as(admin))
            .attach('file', csvOf('E2E Off', phones), 'e2e-off.csv').expect(200);
          expect(res.body.created).toBe(4);
          expect(res.body.duplicates).toHaveLength(2);
          expect(res.body.assignments.map((a: { userId: string }) => a.userId)).not.toContain(off.id);
          expect(res.body.assignments.map((a: { count: number }) => a.count)).toEqual([2, 2]);
          expect((await distribution()).nextUp.id).not.toBe(off.id);
        } finally {
          await http().patch(`/api/v1/lead-assignment/members/${off.id}`).set(as(admin)).send({ enabled: true }).expect(200);
        }
        // Back on: they've waited longest, so they're next.
        expect((await distribution()).nextUp.id).toBe(off.id);

        const db = await prisma();
        const lead = await db.lead.findFirstOrThrow({ where: { name: 'E2E Off 1' } });
        const salesUser = await db.user.findUniqueOrThrow({ where: { email: 'sales@precon.local' } });
        await http().patch(`/api/v1/leads/${lead.id}`).set(as(admin)).send({ assignedToId: salesUser.id }).expect(200);
        expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).autoAssigned).toBe(false);
      });

      it('reads Meta\'s own download (UTF-16, tab-separated) and refuses non-members and non-admins', async () => {
        const tsv = 'id\tcreated_time\tad_name\tfull_name\tphone_number\n' +
          'l:1\t2026-10-28T09:00:00+0530\tSump offer\tE2E Tsv Lead\tp:+919000082201\n';
        const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tsv, 'utf16le')]);
        const res = await http().post('/api/v1/leads/import').set(as(admin)).attach('file', utf16, 'e2e-meta-export.csv').expect(200);
        expect(res.body.created).toBe(1);
        expect(res.body.ignoredColumns).toEqual(['id', 'created_time', 'ad_name']);

        // The factory supervisor is in neither rotation (telecallers or sales).
        const supervisor = await (await prisma()).user.findUniqueOrThrow({ where: { email: 'supervisor@precon.local' } });
        const notMember = await http().patch(`/api/v1/lead-assignment/members/${supervisor.id}`).set(as(admin)).send({ enabled: true }).expect(400);
        expect(notMember.body.message).toMatch(/leads.auto_assign/);
        await http().get('/api/v1/lead-assignment').set(as(sales)).expect(403);
        await http().get('/api/v1/lead-assignment').set(as(telecaller)).expect(403);
      });
    });
  });

  describe('Telecaller → sales workflow: calls, callbacks, qualify, check-ins, dashboards', () => {
    let admin: string;
    let tara: string;
    let kavya: string;
    let sales: string;
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const http = () => request(app.getHttpServer());
    const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    const created: string[] = [];
    let salesTeam: { id: string; fullName: string; autoAssignEnabled: boolean }[] = [];

    async function prisma() {
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      return app.get(PrismaService);
    }
    const userByEmail = async (email: string) => (await prisma()).user.findUniqueOrThrow({ where: { email } });
    /** A fresh lead assigned to Tara, as if the round-robin gave it to her. */
    async function taraLead(name: string, phone: string) {
      const taraUser = await userByEmail('telecaller@precon.local');
      const res = await http().post('/api/v1/leads').set(as(admin)).send({ name, phone, source: 'META', assignedToId: taraUser.id }).expect(201);
      created.push(res.body.id);
      return res.body.id as string;
    }

    beforeAll(async () => {
      admin = (await login('admin@precon.local')).body.accessToken;
      tara = (await login('telecaller@precon.local')).body.accessToken;
      kavya = (await login('telecaller2@precon.local')).body.accessToken;
      sales = (await login('sales@precon.local')).body.accessToken;
      salesTeam = (await http().get('/api/v1/lead-assignment').set(as(admin)).expect(200)).body.sales.members;
      for (const m of salesTeam) await http().patch(`/api/v1/lead-assignment/members/${m.id}`).set(as(admin)).send({ enabled: true }).expect(200);
    });

    afterAll(async () => {
      for (const m of salesTeam) await http().patch(`/api/v1/lead-assignment/members/${m.id}`).set(as(admin)).send({ enabled: m.autoAssignEnabled });
      const db = await prisma();
      await db.siteVisit.deleteMany({ where: { notes: { startsWith: 'E2E' } } });
      await db.lead.deleteMany({ where: { id: { in: created } } });
    });

    it('the sales rotation is the two salespeople, and it can be switched off and on', async () => {
      expect(salesTeam.map((m) => m.fullName).sort()).toEqual(['Priya Sales', 'Suresh Sales']);
      const off = salesTeam[0];
      await http().patch(`/api/v1/lead-assignment/members/${off.id}`).set(as(admin)).send({ enabled: false }).expect(200);
      const team = (await http().get('/api/v1/sales-team').set(as(tara)).expect(200)).body;
      expect(team.members.find((m: { id: string }) => m.id === off.id).inRotation).toBe(false);
      expect(team.nextUp.id).not.toBe(off.id);
      await http().patch(`/api/v1/lead-assignment/members/${off.id}`).set(as(admin)).send({ enabled: true }).expect(200);
    });

    it('log call: records it, moves New → Contacted, sets and reschedules the callback, rejects bad input', async () => {
      const id = await taraLead('E2E Flow Call', '9000084001');
      const db = await prisma();
      await http().post(`/api/v1/leads/${id}/calls`).set(as(tara)).send({ outcome: 'NO_ANSWER', nextCallbackAt: inHours(1) }).expect(201);
      expect((await db.lead.findUniqueOrThrow({ where: { id } })).status).toBe('CONTACTED');
      expect(await db.callLog.count({ where: { leadId: id } })).toBe(1);
      const pending = await db.followUp.findMany({ where: { leadId: id, completedAt: null } });
      expect(pending).toHaveLength(1);

      // Move the callback: the same follow-up is rescheduled, not duplicated.
      const moved = await http().put(`/api/v1/leads/${id}/next-callback`).set(as(tara)).send({ scheduledAt: inHours(48) }).expect(200);
      expect(moved.body.id).toBe(pending[0].id);
      expect(await db.followUp.count({ where: { leadId: id, completedAt: null } })).toBe(1);
      await http().put(`/api/v1/leads/${id}/next-callback`).set(as(tara)).send({ scheduledAt: inHours(-1) }).expect(400);

      // On the workbench, in the right bucket.
      let bench = (await http().get('/api/v1/dashboards/telecaller').set(as(tara)).expect(200)).body;
      expect(bench.items.find((i: { id: string }) => i.id === id).bucket).toBe('later');

      // A call with no new callback completes the old one: "called, no callback set".
      await http().post(`/api/v1/leads/${id}/calls`).set(as(tara)).send({ outcome: 'CALL_BACK', note: 'E2E busy now' }).expect(201);
      const done = await db.followUp.findUniqueOrThrow({ where: { id: pending[0].id } });
      expect(done.completedAt).not.toBeNull();
      expect(done.outcome).toBe('CALL_BACK');
      bench = (await http().get('/api/v1/dashboards/telecaller').set(as(tara)).expect(200)).body;
      const item = bench.items.find((i: { id: string }) => i.id === id);
      expect(item).toMatchObject({ bucket: 'no_next_step', callCount: 2 });
      expect(item.lastCall.outcome).toBe('CALL_BACK');

      await http().post(`/api/v1/leads/${id}/calls`).set(as(tara)).send({ outcome: 'NO_ANSWER', nextCallbackAt: inHours(-2) }).expect(400);
      await http().post(`/api/v1/leads/${id}/calls`).set(as(tara)).send({ outcome: 'WRONG_NUMBER', nextCallbackAt: inHours(2) }).expect(400);
      await http().post(`/api/v1/leads/${id}/calls`).set(as(tara)).send({ outcome: 'MAYBE' }).expect(400);
      // Another telecaller can't touch Tara's lead.
      await http().post(`/api/v1/leads/${id}/calls`).set(as(kavya)).send({ outcome: 'NO_ANSWER' }).expect(404);

      const history = (await http().get(`/api/v1/leads/${id}/calls`).set(as(tara)).expect(200)).body;
      expect(history.map((c: { outcome: string }) => c.outcome)).toEqual(['CALL_BACK', 'NO_ANSWER']);
      expect(history[0].caller.fullName).toBe('Tara Telecaller');
    });

    it('a never-called lead is "new" on the workbench; "not interested" closes it as Lost and it leaves the list', async () => {
      const id = await taraLead('E2E Flow Lost', '9000084002');
      let bench = (await http().get('/api/v1/dashboards/telecaller').set(as(tara)).expect(200)).body;
      expect(bench.items.find((i: { id: string }) => i.id === id).bucket).toBe('new');
      const before = bench.counts.callsToday;
      await http().post(`/api/v1/leads/${id}/calls`).set(as(tara)).send({ outcome: 'NOT_INTERESTED' }).expect(201);
      const lead = await (await prisma()).lead.findUniqueOrThrow({ where: { id } });
      expect(lead.status).toBe('LOST');
      expect(lead.closedAt).not.toBeNull();
      bench = (await http().get('/api/v1/dashboards/telecaller').set(as(tara)).expect(200)).body;
      expect(bench.items.find((i: { id: string }) => i.id === id)).toBeUndefined();
      expect(bench.counts.callsToday).toBe(before + 1);
    });

    it('qualify: fills details, hands to sales by round-robin (or a chosen person), closes the callback, adds a sales follow-up', async () => {
      const db = await prisma();
      const first = await taraLead('E2E Flow Qualify A', '9000084003');
      const second = await taraLead('E2E Flow Qualify B', '9000084004');
      await http().post(`/api/v1/leads/${first}/calls`).set(as(tara)).send({ outcome: 'INTERESTED', nextCallbackAt: inHours(3) }).expect(201);

      const a = await http().post(`/api/v1/leads/${first}/qualify`).set(as(tara)).send({
        productInterest: 'SUMP', sumpSizeLitres: 10000, city: 'Erode', notes: 'E2E wants it in 3 weeks', salesFollowUpAt: inHours(20),
      }).expect(200);
      expect(a.body).toMatchObject({ status: 'QUALIFIED', roundRobin: true });
      const lead = await db.lead.findUniqueOrThrow({ where: { id: first }, include: { assignedTo: { include: { role: true } } } });
      const taraUser = await userByEmail('telecaller@precon.local');
      expect(lead).toMatchObject({ status: 'QUALIFIED', productInterest: 'SUMP', sumpSizeLitres: 10000, city: 'Erode', qualifiedById: taraUser.id, telecallerId: taraUser.id });
      expect(lead.assignedTo?.role.key).toBe('sales');
      expect(lead.notes).toMatch(/Qualified by Tara Telecaller.*E2E wants it in 3 weeks/s);
      // Tara's callback is closed; the salesperson has the new follow-up.
      const pending = await db.followUp.findMany({ where: { leadId: first, completedAt: null } });
      expect(pending).toHaveLength(1);
      expect(pending[0].note).toMatch(/Qualified lead from Tara/);

      // It left Tara's worklist and scope.
      const bench = (await http().get('/api/v1/dashboards/telecaller').set(as(tara)).expect(200)).body;
      expect(bench.items.find((i: { id: string }) => i.id === first)).toBeUndefined();
      await http().get(`/api/v1/leads/${first}`).set(as(tara)).expect(404);

      // The next one goes to the other salesperson.
      const b = await http().post(`/api/v1/leads/${second}/qualify`).set(as(tara)).send({ productInterest: 'MICROBES' }).expect(200);
      expect(b.body.handedTo.id).not.toBe(a.body.handedTo.id);

      // Can't qualify twice, can't hand to a non-salesperson, microbes have no size.
      await http().post(`/api/v1/leads/${first}/qualify`).set(as(admin)).send({ productInterest: 'SUMP' }).expect(400);
      const third = await taraLead('E2E Flow Qualify C', '9000084005');
      const kavyaUser = await userByEmail('telecaller2@precon.local');
      await http().post(`/api/v1/leads/${third}/qualify`).set(as(tara)).send({ productInterest: 'SUMP', salesUserId: kavyaUser.id }).expect(400);
      await http().post(`/api/v1/leads/${third}/qualify`).set(as(tara)).send({ productInterest: 'MICROBES', sumpSizeLitres: 5000 }).expect(400);
      // A chosen salesperson.
      const suresh = await userByEmail('sales@precon.local');
      const c = await http().post(`/api/v1/leads/${third}/qualify`).set(as(tara)).send({ productInterest: 'SUMP', salesUserId: suresh.id }).expect(200);
      expect(c.body).toMatchObject({ roundRobin: false, handedTo: { id: suresh.id } });

      // It shows on Suresh's sales dashboard as a qualified lead from Tara.
      const dash = (await http().get('/api/v1/dashboards/sales').set(as(sales)).expect(200)).body;
      const card = dash.open.find((l: { id: string }) => l.id === third);
      expect(card).toMatchObject({ status: 'QUALIFIED', qualifiedBy: { fullName: 'Tara Telecaller' } });
    });

    it('GPS check-in: sales stores one reading on their lead; shown on their dashboard and the master map', async () => {
      const id = await taraLead('E2E Flow Visit', '9000084006');
      const suresh = await userByEmail('sales@precon.local');
      await http().post(`/api/v1/leads/${id}/qualify`).set(as(tara)).send({ productInterest: 'SUMP', salesUserId: suresh.id }).expect(200);

      const res = await http().post('/api/v1/check-ins').set(as(sales))
        .send({ latitude: 11.0168, longitude: 76.9558, accuracyMeters: 15, leadId: id, note: 'E2E at site' }).expect(201);
      expect(res.body).toMatchObject({ latitude: 11.0168, longitude: 76.9558, accuracyMeters: 15, lead: { id }, person: { id: suresh.id } });
      expect(new Date(res.body.checkedInAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

      const mine = (await http().get('/api/v1/check-ins/mine').set(as(sales)).expect(200)).body;
      expect(mine[0].id).toBe(res.body.id);
      const dash = (await http().get('/api/v1/dashboards/sales').set(as(sales)).expect(200)).body;
      expect(dash.visits.map((v: { id: string }) => v.id)).toContain(res.body.id);
      const master = (await http().get('/api/v1/dashboards/master').set(as(admin)).expect(200)).body;
      expect(master.visits.map((v: { id: string }) => v.id)).toContain(res.body.id);

      await http().post('/api/v1/check-ins').set(as(sales)).send({ latitude: 200, longitude: 76.9 }).expect(400);
      await http().post('/api/v1/check-ins').set(as(sales)).send({ longitude: 76.9 }).expect(400);
      // Not one of Suresh's leads -> 404; telecallers can't check in at all.
      const other = await taraLead('E2E Flow Not Mine', '9000084007');
      await http().post('/api/v1/check-ins').set(as(sales)).send({ latitude: 11, longitude: 77, leadId: other, note: 'E2E x' }).expect(404);
      await http().post('/api/v1/check-ins').set(as(tara)).send({ latitude: 11, longitude: 77 }).expect(403);
    });

    it('dashboards are role-scoped; the master scorecards count the calls just logged', async () => {
      await http().get('/api/v1/dashboards/master').set(as(tara)).expect(403);
      await http().get('/api/v1/dashboards/master').set(as(sales)).expect(403);
      const before = (await http().get('/api/v1/dashboards/master').set(as(admin)).expect(200)).body;
      expect(before.telecallers.map((t: { fullName: string }) => t.fullName).sort()).toEqual(['Arjun Telecaller', 'Kavya Telecaller', 'Tara Telecaller']);
      expect(before.sales.map((t: { fullName: string }) => t.fullName).sort()).toEqual(['Priya Sales', 'Suresh Sales']);

      const id = await taraLead('E2E Flow Score', '9000084008');
      const notCalledBefore = before.telecallers.find((t: { fullName: string }) => t.fullName === 'Tara Telecaller');
      let after = (await http().get('/api/v1/dashboards/master').set(as(admin)).expect(200)).body;
      let row = after.telecallers.find((t: { fullName: string }) => t.fullName === 'Tara Telecaller');
      expect(row.notCalled).toBe(notCalledBefore.notCalled + 1);
      expect(after.flags.some((f: { person: string; message: string }) => f.person === 'Tara Telecaller' && /not called/.test(f.message))).toBe(true);

      await http().post(`/api/v1/leads/${id}/calls`).set(as(tara)).send({ outcome: 'NO_ANSWER', nextCallbackAt: inHours(1) }).expect(201);
      after = (await http().get('/api/v1/dashboards/master').set(as(admin)).expect(200)).body;
      row = after.telecallers.find((t: { fullName: string }) => t.fullName === 'Tara Telecaller');
      expect(row.callsToday).toBe(notCalledBefore.callsToday + 1);
      expect(row.notCalled).toBe(notCalledBefore.notCalled);
    });
  });

  describe('WhatsApp quick-contact: templates, wa.me link, activity log', () => {
    let admin: string;
    let tara: string;
    let kavya: string;
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const http = () => request(app.getHttpServer());
    const leadIds: string[] = [];

    async function prisma() {
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      return app.get(PrismaService);
    }
    async function taraLead(name: string, phone: string, extra: Record<string, unknown> = {}) {
      const taraUser = await (await prisma()).user.findUniqueOrThrow({ where: { email: 'telecaller@precon.local' } });
      const res = await http().post('/api/v1/leads').set(as(admin)).send({ name, phone, source: 'META', assignedToId: taraUser.id, ...extra }).expect(201);
      leadIds.push(res.body.id);
      return res.body.id as string;
    }

    beforeAll(async () => {
      admin = (await login('admin@precon.local')).body.accessToken;
      tara = (await login('telecaller@precon.local')).body.accessToken;
      kavya = (await login('telecaller2@precon.local')).body.accessToken;
    });
    afterAll(async () => {
      const db = await prisma();
      await db.lead.deleteMany({ where: { id: { in: leadIds } } });
      await db.messageTemplate.deleteMany({ where: { name: { startsWith: 'E2E' } } });
    });

    it('everyone with leads sees the active templates; only admins manage them', async () => {
      const list = (await http().get('/api/v1/message-templates').set(as(tara)).expect(200)).body;
      // The starters, in order (admins may have added their own around them).
      const starters = list.map((t: { name: string }) => t.name).filter((n: string) => ['Intro message', 'Follow-up message', 'Quotation message'].includes(n));
      expect(starters).toEqual(['Intro message', 'Follow-up message', 'Quotation message']);
      expect(list.every((t: { isActive: boolean }) => t.isActive)).toBe(true);
      await http().get('/api/v1/message-templates?all=true').set(as(tara)).expect(403);
      await http().post('/api/v1/message-templates').set(as(tara)).send({ name: 'E2E Nope', body: 'Hello there' }).expect(403);
      const placeholders = (await http().get('/api/v1/message-templates/placeholders').set(as(tara)).expect(200)).body;
      expect(placeholders.map((p: { key: string }) => p.key)).toContain('{name}');
    });

    it('fills the template from the lead, adds 91 to the number, logs it on the lead', async () => {
      const id = await taraLead('E2E Wa Ravi Kumar', '98765 01234', { city: 'Erode', productInterest: 'SUMP', sumpSizeLitres: 10000 });
      const tpl = (await http().post('/api/v1/message-templates').set(as(admin))
        .send({ name: 'E2E Quote', body: 'Hi {first_name}, {my_name} from {company}: your {product} for {city}. {Name}', sortOrder: 9 }).expect(201)).body;
      await http().post('/api/v1/message-templates').set(as(admin)).send({ name: 'E2E Quote', body: 'Duplicate name' }).expect(409);

      const res = await http().post(`/api/v1/leads/${id}/whatsapp`).set(as(tara)).send({ templateId: tpl.id }).expect(201);
      expect(res.body.phone).toBe('919876501234');
      expect(res.body.message).toBe('Hi E2E, Tara Telecaller from Precon: your Sump · 10,000 L for Erode. E2E Wa Ravi Kumar');
      expect(res.body.url).toBe(`https://wa.me/919876501234?text=${encodeURIComponent(res.body.message)}`);

      // Without a template: just opens the chat.
      const blank = await http().post(`/api/v1/leads/${id}/whatsapp`).set(as(tara)).send({}).expect(201);
      expect(blank.body.url).toBe('https://wa.me/919876501234');

      const log = (await http().get(`/api/v1/leads/${id}/messages`).set(as(tara)).expect(200)).body;
      expect(log).toHaveLength(2);
      expect(log[1]).toMatchObject({ type: 'WHATSAPP', templateName: 'E2E Quote', user: { fullName: 'Tara Telecaller' } });

      // Deleting the template keeps the history readable; switched-off templates can't be used.
      await http().delete(`/api/v1/message-templates/${tpl.id}`).set(as(admin)).expect(204);
      const after = (await http().get(`/api/v1/leads/${id}/messages`).set(as(tara)).expect(200)).body;
      expect(after[1].templateName).toBe('E2E Quote');
      const off = (await http().post('/api/v1/message-templates').set(as(admin)).send({ name: 'E2E Off', body: 'Hello {name}', isActive: false }).expect(201)).body;
      await http().post(`/api/v1/leads/${id}/whatsapp`).set(as(tara)).send({ templateId: off.id }).expect(400);
      expect((await http().get('/api/v1/message-templates?all=true').set(as(admin)).expect(200)).body.map((t: { name: string }) => t.name)).toContain('E2E Off');
    });

    it('admin creates, edits, switches off and deletes templates; the picker shows active ones in order; others cannot manage', async () => {
      const sales = (await login('sales@precon.local')).body.accessToken;
      const picker = async () => (await http().get('/api/v1/message-templates').set(as(tara)).expect(200)).body.map((t: { name: string }) => t.name);

      // Create: name and a real body are required.
      await http().post('/api/v1/message-templates').set(as(admin)).send({ name: 'E2E Visit', body: '   ' }).expect(400);
      const noName = await http().post('/api/v1/message-templates').set(as(admin)).send({ name: ' ', body: 'Hello {name}' }).expect(400);
      expect(noName.body.message.join(' ')).toMatch(/Give the template a name/);
      const created = (await http().post('/api/v1/message-templates').set(as(admin))
        .send({ name: '  E2E Visit  ', body: '  Hi {first_name}, {my_name} will visit {city} tomorrow.  ', sortOrder: 0 }).expect(201)).body;
      expect(created).toMatchObject({ name: 'E2E Visit', body: 'Hi {first_name}, {my_name} will visit {city} tomorrow.', isActive: true });
      // Order: sortOrder, then name. Sort 0 comes before the starters (1, 2, 3).
      let names = await picker();
      expect(names.indexOf('E2E Visit')).toBeLessThan(names.indexOf('Intro message'));

      // Edit (also works on a seeded starter): rename, new body, move down the list.
      const edited = (await http().patch(`/api/v1/message-templates/${created.id}`).set(as(admin))
        .send({ name: 'E2E Visit confirm', body: 'Hi {name}, confirming the site visit in {city}.', sortOrder: 50 }).expect(200)).body;
      expect(edited).toMatchObject({ name: 'E2E Visit confirm', body: 'Hi {name}, confirming the site visit in {city}.', sortOrder: 50 });
      names = await picker();
      expect(names.indexOf('E2E Visit confirm')).toBeGreaterThan(names.indexOf('Quotation message'));
      await http().patch(`/api/v1/message-templates/${created.id}`).set(as(admin)).send({ body: 'x' }).expect(400);
      await http().patch(`/api/v1/message-templates/${created.id}`).set(as(admin)).send({ name: 'Intro message' }).expect(409);

      // Switch off: hidden from the picker, still listed for admin.
      await http().patch(`/api/v1/message-templates/${created.id}`).set(as(admin)).send({ isActive: false }).expect(200);
      expect(await picker()).not.toContain('E2E Visit confirm');
      const all = (await http().get('/api/v1/message-templates?all=true').set(as(admin)).expect(200)).body;
      expect(all.find((t: { id: string }) => t.id === created.id).isActive).toBe(false);

      // Telecallers and sales can use templates but not manage them.
      for (const token of [tara, sales]) {
        await http().post('/api/v1/message-templates').set(as(token)).send({ name: 'E2E Nope', body: 'Hello there' }).expect(403);
        await http().patch(`/api/v1/message-templates/${created.id}`).set(as(token)).send({ isActive: true }).expect(403);
        await http().delete(`/api/v1/message-templates/${created.id}`).set(as(token)).expect(403);
      }

      // Delete.
      await http().delete(`/api/v1/message-templates/${created.id}`).set(as(admin)).expect(204);
      await http().delete(`/api/v1/message-templates/${created.id}`).set(as(admin)).expect(404);
      expect((await http().get('/api/v1/message-templates?all=true').set(as(admin)).expect(200)).body.map((t: { id: string }) => t.id)).not.toContain(created.id);
      expect(await picker()).not.toContain('E2E Visit confirm');
    });

    it("refuses other people's leads and numbers WhatsApp can't use", async () => {
      const id = await taraLead('E2E Wa Scope', '9876501235');
      await http().post(`/api/v1/leads/${id}/whatsapp`).set(as(kavya)).send({}).expect(404);
      await http().get(`/api/v1/leads/${id}/messages`).set(as(kavya)).expect(404);
      const landline = await taraLead('E2E Wa Landline', '0422 2345678');
      const res = await http().post(`/api/v1/leads/${landline}/whatsapp`).set(as(tara)).send({}).expect(400);
      expect(res.body.message).toMatch(/WhatsApp/);
    });
  });

  describe('Reports: date ranges, role scope, CSV / Excel export', () => {
    let admin: string;
    let tara: string;
    let kavya: string;
    let sales: string;
    let supervisor: string;
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const http = () => request(app.getHttpServer());
    const range = '?from=2026-01-01&to=2028-12-31'; // within the 3-year limit
    const leadIds: string[] = [];

    async function prisma() {
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      return app.get(PrismaService);
    }

    beforeAll(async () => {
      admin = (await login('admin@precon.local')).body.accessToken;
      tara = (await login('telecaller@precon.local')).body.accessToken;
      kavya = (await login('telecaller2@precon.local')).body.accessToken;
      sales = (await login('sales@precon.local')).body.accessToken;
      supervisor = (await login('supervisor@precon.local')).body.accessToken;
    });
    afterAll(async () => {
      await (await prisma()).lead.deleteMany({ where: { id: { in: leadIds } } });
    });

    it('admin sees every report for everyone; telecallers get no revenue; others no reports at all', async () => {
      const mine = (await http().get('/api/v1/reports').set(as(admin)).expect(200)).body;
      expect(mine.map((r: { key: string }) => r.key)).toEqual(['leads-by-source', 'telecallers', 'pipeline', 'revenue', 'follow-ups']);
      expect(mine.every((r: { scope: string }) => r.scope === 'all')).toBe(true);
      const tc = (await http().get('/api/v1/reports').set(as(tara)).expect(200)).body;
      expect(tc.map((r: { key: string }) => r.key)).not.toContain('revenue');
      expect(tc[0].scope).toBe('own');
      await http().get(`/api/v1/reports/revenue${range}`).set(as(tara)).expect(403);
      await http().get('/api/v1/reports').set(as(supervisor)).expect(403);
      await http().get('/api/v1/reports/nope').set(as(admin)).expect(404);
      await http().get('/api/v1/reports/pipeline?from=2026-10-10&to=2026-10-01').set(as(admin)).expect(400);
      await http().get('/api/v1/reports/pipeline?from=2026-13-40').set(as(admin)).expect(400);
      await http().get('/api/v1/reports/pipeline?from=2020-01-01&to=2026-01-01').set(as(admin)).expect(400); // over 3 years
    });

    it('a salesperson only sees their own revenue and follow-ups; admin sees both salespeople', async () => {
      const all = (await http().get(`/api/v1/reports/revenue${range}`).set(as(admin)).expect(200)).body;
      expect(all.rows.map((r: { salesperson: string }) => r.salesperson).sort()).toEqual(['Priya Sales', 'Suresh Sales']);
      const totalRevenue = all.rows.reduce((n: number, r: { revenue: string }) => n + Number(r.revenue), 0);
      expect(Number(all.totals.revenue)).toBeCloseTo(totalRevenue, 2);

      const own = (await http().get(`/api/v1/reports/revenue${range}`).set(as(sales)).expect(200)).body;
      expect(own.scope).toBe('own');
      expect(own.rows.map((r: { salesperson: string }) => r.salesperson)).toEqual(['Suresh Sales']);
      expect(own.rows[0].revenue).toBe(all.rows.find((r: { salesperson: string }) => r.salesperson === 'Suresh Sales').revenue);

      const fu = (await http().get(`/api/v1/reports/follow-ups${range}`).set(as(sales)).expect(200)).body;
      expect(fu.rows.map((r: { person: string }) => r.person)).toEqual(['Suresh Sales']);
      const tel = (await http().get(`/api/v1/reports/telecallers${range}`).set(as(sales)).expect(200)).body;
      expect(tel.rows.map((r: { telecaller: string }) => r.telecaller)).toEqual(['Suresh Sales']);
      const allTel = (await http().get(`/api/v1/reports/telecallers${range}`).set(as(admin)).expect(200)).body;
      expect(allTel.rows.map((r: { telecaller: string }) => r.telecaller)).toEqual(['Arjun Telecaller', 'Kavya Telecaller', 'Tara Telecaller']);
    });

    it("telecallers' lead reports count only their own leads", async () => {
      const before = (await http().get(`/api/v1/reports/pipeline${range}`).set(as(tara)).expect(200)).body;
      const kavyaBefore = (await http().get(`/api/v1/reports/pipeline${range}`).set(as(kavya)).expect(200)).body;
      const taraUser = await (await prisma()).user.findUniqueOrThrow({ where: { email: 'telecaller@precon.local' } });
      const res = await http().post('/api/v1/leads').set(as(admin)).send({ name: 'E2E Report Lead', phone: '9000085001', source: 'REFERRAL', assignedToId: taraUser.id }).expect(201);
      leadIds.push(res.body.id);
      const after = (await http().get(`/api/v1/reports/pipeline${range}`).set(as(tara)).expect(200)).body;
      expect(after.totals.leads).toBe(before.totals.leads + 1);
      expect(after.rows.reduce((n: number, r: { leads: number }) => n + r.leads, 0)).toBe(after.totals.leads);
      expect((await http().get(`/api/v1/reports/pipeline${range}`).set(as(kavya)).expect(200)).body.totals.leads).toBe(kavyaBefore.totals.leads);
      const bySource = (await http().get(`/api/v1/reports/leads-by-source${range}`).set(as(tara)).expect(200)).body;
      expect(bySource.rows.find((r: { source: string }) => r.source === 'Referral').leads).toBeGreaterThanOrEqual(1);
    });

    it('exports to CSV and Excel with the same numbers', async () => {
      const json = (await http().get(`/api/v1/reports/leads-by-source${range}`).set(as(admin)).expect(200)).body;
      const csv = await http().get(`/api/v1/reports/leads-by-source${range}&format=csv`).set(as(admin)).expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.headers['content-disposition']).toMatch(/precon-leads-by-source-2026-01-01-to-2028-12-31\.csv/);
      const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
      expect(lines[0]).toBe('Source,Leads,Qualified,Won,Lost,Qualified rate (%),Win rate (%)');
      expect(lines).toHaveLength(json.rows.length + 2); // header + rows + total
      expect(lines.at(-1)).toMatch(new RegExp(`^Total,${json.totals.leads},`));

      const xlsx = await http().get(`/api/v1/reports/revenue${range}&format=xlsx`).set(as(admin)).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xlsx.body);
      const ws = wb.worksheets[0];
      expect(ws.getCell('A1').value).toBe('Revenue by salesperson');
      expect(ws.getRow(4).values).toEqual([undefined, 'Salesperson', 'Orders', 'Revenue', 'Average order', 'Leads won']);
      expect(ws.getColumn(3).numFmt).toMatch(/#,##0\.00/);

      // A salesperson's export is their own data only.
      const ownCsv = await http().get(`/api/v1/reports/revenue${range}&format=csv`).set(as(sales)).expect(200);
      expect(ownCsv.text).toMatch(/Suresh Sales/);
      expect(ownCsv.text).not.toMatch(/Priya Sales/);
    });
  });

  describe('Notifications: bell, reminders, mark as read', () => {
    let admin: string;
    let tara: string;
    let kavya: string;
    let sales: string;
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const http = () => request(app.getHttpServer());
    const leadIds: string[] = [];
    const bell = async (token: string) => (await http().get('/api/v1/notifications').set(as(token)).expect(200)).body;

    async function prisma() {
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      return app.get(PrismaService);
    }

    beforeAll(async () => {
      admin = (await login('admin@precon.local')).body.accessToken;
      tara = (await login('telecaller@precon.local')).body.accessToken;
      kavya = (await login('telecaller2@precon.local')).body.accessToken;
      sales = (await login('sales@precon.local')).body.accessToken;
    });
    afterAll(async () => {
      await (await prisma()).lead.deleteMany({ where: { id: { in: leadIds } } });
    });

    it('a lead assigned to you shows in your bell (not the assigner’s); mark one / all read', async () => {
      const db = await prisma();
      const taraUser = await db.user.findUniqueOrThrow({ where: { email: 'telecaller@precon.local' } });
      const before = await bell(tara);
      const adminBefore = await bell(admin);
      const res = await http().post('/api/v1/leads').set(as(admin)).send({ name: 'E2E Bell Lead', phone: '9000086001', source: 'META', assignedToId: taraUser.id }).expect(201);
      leadIds.push(res.body.id);

      const after = await bell(tara);
      expect(after.unread).toBe(before.unread + 1);
      expect(after.updates[0]).toMatchObject({ type: 'LEAD_ASSIGNED', title: 'New lead: E2E Bell Lead', readAt: null, lead: { id: res.body.id } });
      expect(after.updates[0].body).toMatch(/Assigned by Asha Admin/);
      expect((await bell(admin)).updates.length).toBe(adminBefore.updates.length);

      // Only the owner can mark it read.
      await http().post(`/api/v1/notifications/${after.updates[0].id}/read`).set(as(kavya)).expect(404);
      await http().post(`/api/v1/notifications/${after.updates[0].id}/read`).set(as(tara)).expect(200);
      expect((await bell(tara)).unread).toBe(before.unread);
      await http().post('/api/v1/notifications/read-all').set(as(tara)).expect(200);
      expect((await bell(tara)).unread).toBe(0);
    });

    it('due and overdue callbacks become reminders once, and clear when the call is logged', async () => {
      const db = await prisma();
      const taraUser = await db.user.findUniqueOrThrow({ where: { email: 'telecaller@precon.local' } });
      const res = await http().post('/api/v1/leads').set(as(admin)).send({ name: 'E2E Bell Callback', phone: '9000086002', source: 'META', assignedToId: taraUser.id }).expect(201);
      leadIds.push(res.body.id);
      await db.followUp.create({ data: { leadId: res.body.id, scheduledAt: new Date(Date.now() - 3_600_000), note: 'E2E call back', createdById: taraUser.id } });

      let feed = await bell(tara);
      const reminder = feed.reminders.find((r: { lead: { id: string } }) => r.lead.id === res.body.id);
      expect(reminder).toMatchObject({ type: 'FOLLOW_UP_DUE', overdue: true, title: 'Call E2E Bell Callback', body: 'E2E call back' });
      feed = await bell(tara); // checking again doesn't duplicate it
      expect(feed.reminders.filter((r: { lead: { id: string } }) => r.lead.id === res.body.id)).toHaveLength(1);
      const summary = (await http().get('/api/v1/notifications/summary').set(as(tara)).expect(200)).body;
      expect(summary.overdue.map((f: { lead: { id: string } }) => f.lead.id)).toContain(res.body.id);

      const unread = feed.unread;
      await http().post(`/api/v1/leads/${res.body.id}/calls`).set(as(tara)).send({ outcome: 'NO_ANSWER' }).expect(201);
      feed = await bell(tara);
      expect(feed.reminders.find((r: { lead: { id: string } }) => r.lead.id === res.body.id)).toBeUndefined();
      expect(feed.unread).toBe(unread - 1);
    });

    it('a qualified lead handed to sales notifies the salesperson; round-robin leads notify the telecaller', async () => {
      const db = await prisma();
      const taraUser = await db.user.findUniqueOrThrow({ where: { email: 'telecaller@precon.local' } });
      const suresh = await db.user.findUniqueOrThrow({ where: { email: 'sales@precon.local' } });
      const res = await http().post('/api/v1/leads').set(as(admin)).send({ name: 'E2E Bell Handover', phone: '9000086003', source: 'META', assignedToId: taraUser.id }).expect(201);
      leadIds.push(res.body.id);
      await http().post(`/api/v1/leads/${res.body.id}/qualify`).set(as(tara)).send({ productInterest: 'SUMP', salesUserId: suresh.id }).expect(200);
      const feed = await bell(sales);
      expect(feed.updates[0]).toMatchObject({ type: 'LEAD_HANDED_OVER', title: 'Qualified lead from Tara Telecaller: E2E Bell Handover', readAt: null });
      expect((await http().get('/api/v1/notifications/summary').set(as(sales)).expect(200)).body.handedToday).toBeGreaterThanOrEqual(1);

      // An import shared round-robin notifies whoever got each lead.
      const csv = 'name,phone\nE2E Bell Import,9000086004\n';
      const imported = await http().post('/api/v1/leads/import').set(as(admin)).attach('file', Buffer.from(csv), 'e2e-bell.csv').expect(200);
      leadIds.push(imported.body.createdRows[0].leadId);
      const owner = await db.lead.findUniqueOrThrow({ where: { id: imported.body.createdRows[0].leadId }, select: { assignedToId: true } });
      const note = await db.notification.findFirstOrThrow({ where: { leadId: imported.body.createdRows[0].leadId } });
      expect(note).toMatchObject({ userId: owner.assignedToId, type: 'LEAD_ASSIGNED' });
      expect(note.body).toMatch(/^Round-robin · Import: e2e-bell\.csv/);
    });
  });

  describe('Product switch: operations modules behind OPERATIONS_ENABLED', () => {
    let admin: string;
    let sales: string;
    let tara: string;
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const http = () => request(app.getHttpServer());
    // One representative route per hidden module, each readable by admin.
    const OPERATIONS_ROUTES = [
      '/api/v1/sales-orders',
      '/api/v1/finance/overdue-balances',
      '/api/v1/vendors',
      '/api/v1/stock',
      '/api/v1/installations',
      '/api/v1/service-jobs',
      '/api/v1/leave/mine',
      '/api/v1/holidays',
      '/api/v1/allowances',
      '/api/v1/lop/summary?month=2026-10',
      '/api/v1/hr/employees',
    ];
    const CRM_ROUTES = [
      '/api/v1/leads',
      '/api/v1/follow-ups',
      '/api/v1/dashboards/master',
      '/api/v1/reports',
      '/api/v1/message-templates',
      '/api/v1/notifications',
      '/api/v1/lead-assignment',
      '/api/v1/site-visits',
    ];

    beforeAll(async () => {
      admin = (await login('admin@precon.local')).body.accessToken;
      sales = (await login('sales@precon.local')).body.accessToken;
      tara = (await login('telecaller@precon.local')).body.accessToken;
    });
    afterAll(() => {
      process.env.OPERATIONS_ENABLED = 'true';
    });

    it('when OFF (the default): operations routes answer 404 for everyone, admin included; the CRM works', async () => {
      delete process.env.OPERATIONS_ENABLED; // unset = off
      expect((await http().get('/api/v1/config').expect(200)).body).toEqual({ operationsEnabled: false });
      for (const path of OPERATIONS_ROUTES) {
        const res = await http().get(path).set(as(admin));
        expect({ path, status: res.status }).toEqual({ path, status: 404 });
        expect(res.body.message).toMatch(/switched off/);
      }
      await http().get('/api/v1/sales-orders').set(as(sales)).expect(404);
      await http().get('/api/v1/leave/mine').set(as(tara)).expect(404);
      for (const path of CRM_ROUTES) {
        const res = await http().get(path).set(as(admin));
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
      }
      await http().get('/api/v1/dashboards/telecaller').set(as(tara)).expect(200);
      await http().get('/api/v1/dashboards/sales').set(as(sales)).expect(200);
      // Unknown or "false" values also mean off.
      process.env.OPERATIONS_ENABLED = 'false';
      await http().get('/api/v1/stock').set(as(admin)).expect(404);
    });

    it('when ON: the same routes are available again, with the usual permissions', async () => {
      process.env.OPERATIONS_ENABLED = 'true';
      expect((await http().get('/api/v1/config').expect(200)).body).toEqual({ operationsEnabled: true });
      for (const path of OPERATIONS_ROUTES) {
        const res = await http().get(path).set(as(admin));
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
      }
      // Permissions apply as before: a telecaller still can't open finance.
      await http().get('/api/v1/finance/overdue-balances').set(as(tara)).expect(403);
    });
  });
});

