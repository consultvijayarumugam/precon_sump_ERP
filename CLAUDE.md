# Precon ERP

An all-in-one ERP for a manufacturer of precon (precast concrete) sumps and
microbes. It covers the full lifecycle
from marketing lead to sales to closed deal to production to installation to
after-sales service, plus HR, finance, and admin.

## Products (decided)

The business makes exactly TWO product types:
- Sump: precon sump, sold in litre sizes. Valid sizes: 3000, 4000, 5000, 6000,
  8000, 10000, 12000, 15000, 20000 litres. Each size is its own stock item with
  its own quantity on hand and low-stock threshold. Wherever a product is chosen
  (orders, installations via their order), pick Sump and then a size. A lead's
  size interest is optional (the customer may not know yet).
- Microbes: no sizes, counted in simple units (packs), one stock count and one
  low-stock threshold.
There are no other product lines (no bio-septic tanks, no precast panels).

## Product focus (current)

The live product is ONLY the sales + telecaller + admin CRM (leads, round-robin,
telecaller workbench, sales pipeline, master dashboard, follow-ups/calendar,
reports, WhatsApp templates, notifications, GPS site visits). The operations
modules (finance, stock, vendors, service, installations, HR leave/holidays/
LOP/allowances) are built but HIDDEN behind the OPERATIONS_ENABLED switch in
api/.env (default off). Do not delete their code or tables: the client plans to
expand into operations in about 4-5 months. While the switch is off, keep new
work CRM-focused and don't make CRM screens depend on operations endpoints.
Live roles: admin, sales, telecaller.

## Architecture (decided)

- API-first. One backend serves both the web dashboard and (later) the mobile app.
- Backend: Node.js with NestJS, REST API.
- Database: PostgreSQL.
- Web dashboard: React with Next.js. Used by admin, sales, factory supervisor.
- Mobile app: React Native. Built in Phase 4, NOT before. Used by telecaller and field sales.
- Auth: JWT with role-based access control (RBAC). This powers the tag system below.
- Maps: OpenStreetMap with Leaflet only. NEVER use the Google Maps API. Location is
  captured as a one-time GPS lat/long reading on the device (free) and shown as a pin
  on a free OSM map. No live tracking, no map API bills.

## Roles and tags (requirement 20)

Four roles: admin, sales, telecaller, factory_supervisor.
Admin assigns which modules and tags each user can see and use. Every screen and
API endpoint must check the user's role and permissions. Build this as a flexible
permission-tag system, not hardcoded role checks.

## Modules and requirements

### 1. CRM and Sales
- Multi-source lead capture: Meta (Facebook) Lead Ads webhook, manual, and others (1)
- Sales follow-up tracking (2)
- Closed and won leads (3)
- Telecaller dialer log: record each call with a timestamp, via in-app dialer (11)
- Calendar of follow-ups (17)

### 2. Production and Operations
- Production stock and inventory, surfaced on a dashboard (6)
- Installation scheduling (12)
- Site-visit tags (18)

### 3. Service (after installation)
- Post-install service jobs (4)
- Service follow-ups (5)

### 4. Finance
- Revenue attributed per employee (7)
- Employee allowances (8)
- Balance and overdue payment tracking (13)
- Vendor purchase, payments, and outstanding balances (14)

### 5. HR and Workforce
- Attendance with a GPS location stamp at check-in and check-out, shown on an OSM map (9, 15)
- Location check-in: user shares current location on demand. Point-in-time only, not live tracking (10)
- Leave and company holidays calendar (16)
- Leave application; unapproved absence equals Loss of Pay / LOP (19)

### 6. Admin and Platform
- Role-based tag assignment (20)
- Public REST API endpoints for external integration (21)

## Build phases (do in order, do not jump ahead)

- Phase 1 - Foundation: DB schema, auth, RBAC and tag system (20), API skeleton (21).
- Phase 2 - CRM core: leads (1), follow-ups (2), closed leads (3), calendar (17).
- Phase 3 - Finance and stock: revenue (7), overdue (13), vendor outstanding (14), stock dashboard (6).
- Phase 4 - Mobile app: attendance and map (9, 15), location check-in (10), dialer log (11), leave (16, 19), allowances (8).
- Phase 5 - Delivery and service: installation schedule (12), site-visit tags (18), service (4, 5).

## Conventions

- Keep the API and web client in separate folders (/api and /web).
- Document each API endpoint; keep a short README updated.
- Use environment variables for all secrets and DB credentials. Never hardcode.
- Prefer clear, well-named code over clever code.
- Add seed data so screens can be demoed without real data.