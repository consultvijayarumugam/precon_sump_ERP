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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
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

    it('telecaller without CRM tags is refused', async () => {
      const telecaller = (await login('telecaller@precon.local')).body.accessToken;
      await request(app.getHttpServer()).get('/api/v1/leads').set(as(telecaller)).expect(403);
    });

    it('sales creates a lead (auto-assigned), cannot reassign it, and another salesperson cannot see it', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set(as(sales))
        .send({ name: 'E2E Lead', phone: '98765 11111', source: 'MANUAL', productInterest: 'UG_SUMP' })
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
        .send({ name: 'X', phone: '12', source: 'TV', productInterest: 'PRECAST' })
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
    async function wonLead(name: string, productInterest = 'MICROBES') {
      const res = await http()
        .post('/api/v1/leads')
        .set(as(sales))
        .send({ name, phone: '9000011111', source: 'MANUAL', productInterest, status: 'WON' })
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
        .send({ name: 'E2E Open Lead', phone: '9000022222', source: 'MANUAL', productInterest: 'PRECAST' })
        .expect(201);
      created.leadIds.push(openLead.body.id);
      await http().post('/api/v1/sales-orders').set(as(sales))
        .send({ leadId: openLead.body.id, quantity: 1, totalAmount: 1 }).expect(400);

      // Another salesperson can't see it; the lead can't leave WON while it has an order.
      await http().get(`/api/v1/sales-orders/${order.body.id}`).set(as(sales2)).expect(404);
      await http().patch(`/api/v1/leads/${leadId}`).set(as(sales)).send({ status: 'QUOTED' }).expect(400);
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

    it('revenue by employee is admin-only and includes the new order', async () => {
      await http().get('/api/v1/finance/revenue-by-employee').set(as(sales)).expect(403);
      const res = await http().get('/api/v1/finance/revenue-by-employee').set(as(admin)).expect(200);
      expect(res.body.rows.some((r: { salesperson: { fullName: string } }) => r.salesperson.fullName === 'Suresh Sales')).toBe(true);
    });

    it('delivering reduces stock once; needs stock.write; refuses when stock is short', async () => {
      const id = created.orderIds[0];
      const db = await prisma();
      const product = await db.product.findUniqueOrThrow({ where: { code: 'MICROBES' } });

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
      const bio = list.body.items.find((p: { code: string }) => p.code === 'BIO_SEPTIC_TANK');
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
        supervisor: 'supervisor@precon.local', tech: 'tech@precon.local',
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
      const microbes = await db.product.findUniqueOrThrow({ where: { code: 'MICROBES' } });
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

      await http().get(`/api/v1/service-jobs/${job.body.id}`).set(as('sales')).expect(200); // sold it
      await http().get(`/api/v1/service-jobs/${job.body.id}`).set(as('sales2')).expect(404); // didn't
      await http().get(`/api/v1/service-jobs/${job.body.id}`).set(as('tech')).expect(200); // assigned
      await http().get('/api/v1/service-jobs').set(as('supervisor')).expect(403); // no service tags
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
      const overdue = await http().get('/api/v1/service-follow-ups?state=overdue').set(as('sales')).expect(200);
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
      await http().get('/api/v1/site-visits').set(as('sales')).expect(403);

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
});
