# Precon ERP

ERP for a manufacturer of precon (precast concrete) sumps and microbes. See `CLAUDE.md` for the full scope and build phases.

**Products:** the business makes two product types:
- **Sump**, in litre sizes 3,000 / 4,000 / 5,000 / 6,000 / 8,000 / 10,000 / 12,000 / 15,000 / 20,000. **Each size is its own stock item**, with its own quantity and low-stock alert level.
- **Microbes**, a single stock count in packs.

Wherever a product is chosen, it's either **Sump + size** or **Microbes**. A lead's sump size is optional; an order's is required.

> **Live product: the sales + telecaller + admin CRM.** Leads (import, API, Meta), round-robin, the telecaller workbench, sales pipeline, master dashboard, follow-ups and calendar, reports and export, WhatsApp templates, in-app notifications and GPS site check-ins.
> The **operations modules** (finance, stock, vendors, service, installations, HR leave / holidays / LOP / allowances) are built but **switched off** by `OPERATIONS_ENABLED` (see "Product switch" below). Their code and tables are kept, ready to switch on when the business expands into operations.

**Current status: Phases 1–3, the web part of Phase 5, and the web HR pieces are done.** The Phase 4 mobile app (GPS attendance, location check-in, dialer) is not started.

- **Phase 1:** DB schema for users, roles and permission tags, JWT auth (login/logout), the RBAC guard, and admin endpoints for assigning tags.
- **Phase 2:** leads (#1), sales follow-ups (#2), closed/won leads (#3), and the follow-up calendar (#17).
- **Phase 3:** sales orders and revenue per employee (#7), customer payments and overdue balances (#13), vendors, purchases and payables (#14), and the production stock dashboard (#6).
- **Phase 5 (web):** installation scheduling (#12), post-install service jobs (#4), service follow-ups (#5), and site visits with admin-managed tags (#18).
- **HR (web):** leave application and approval (#19), company holidays and the team leave calendar (#16), the Loss of Pay monthly summary (#19), and allowances (#8).

```
/api   NestJS 12 + Prisma 7 + PostgreSQL   (port 4000)
/web   Next.js 16 (App Router) + Tailwind  (port 3000)
```

## Run locally

Prerequisites: Node 20+ and PostgreSQL running locally (Homebrew: `brew services start postgresql@16`).

```bash
# 1. Database
createdb precon_erp

# 2. API
cd api
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, SEED_USER_PASSWORD
npm install                 # also generates the Prisma client
npm run db:deploy           # apply migrations
npm run db:seed             # roles, tags, demo users, and sample data for every module
npm run start:dev           # http://localhost:4000/api/v1  (Swagger: http://localhost:4000/api/docs)

# 3. Web (new terminal)
cd web
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

## Testing from other devices on the same Wi-Fi (local network only)

> **This is not a deployment.** It runs the dev servers on your Mac so a phone or another laptop **on the same Wi-Fi** can try the app with demo data. Nothing is exposed to the internet. There's no HTTPS, no domain, and no production build. Real hosting will be set up separately later.

**How it works.** The browser only talks to the web app on port **3000**. The web app forwards every `/api/v1/...` request to the API on this Mac (a `rewrites` rule in `web/next.config.ts`). So the phone never needs the API's address and no CORS is involved.

1. **Find your Mac's Wi-Fi IP:** `ipconfig getifaddr en0` (e.g. `192.168.31.50`).
2. **Start the API** in terminal 1: `cd api && npm run start:dev`. It listens on `0.0.0.0:4000`, set by `HOST` in `api/.env`.
3. **Start the web app** in terminal 2: `cd web && npm run dev:lan`. It listens on `0.0.0.0:3000`.
4. **On the phone or other laptop** (same Wi-Fi), open `http://<your-mac-ip>:3000` and sign in with a demo user.
   - **Port 3000 already in use** (for example by another project's dev server): start this one with `cd web && npx next dev --hostname 0.0.0.0 --port 3001` and open `:3001` instead. Opening `:3000` would show the other app.

Things to know:

- **The IP can change** when the Mac reconnects to Wi-Fi or the router restarts. Re-run step 1 and use the new address; nothing in the code needs changing. To keep it fixed, reserve the address for your Mac in the router's DHCP settings.
- **Both devices must be on the same network.** Phones on mobile data, guest Wi-Fi, or networks with "client isolation" can't reach the Mac.
- **Firewall:** if macOS asks whether `node` may accept incoming connections, choose **Allow**. If the firewall is on and blocking, allow `node` under System Settings → Network → Firewall → Options.
- **Use `http://`, not `https://`,** in the phone's browser.
- **Keep the Mac awake** with the lid open, or use `caffeinate`, while testing.
- **Dev-only settings:**
  - `allowedDevOrigins` in `web/next.config.ts` lets `192.168.*.*` and `10.*.*.*` addresses load development assets. It only affects `next dev`.
  - `HOST=0.0.0.0` makes the API reachable on the LAN. Set `HOST=127.0.0.1` to keep it on this Mac only.
  - `CORS_ORIGINS` in `api/.env` only matters if a browser calls the API directly instead of through the web app.
- **Anyone on the same Wi-Fi** can open the login page while the servers run, so only use demo data and passwords.

### Demo users (password = `SEED_USER_PASSWORD` in `api/.env`)

| Role               | Email |
|--------------------|-------|
| admin              | admin@precon.local (Asha) |
| sales              | sales@precon.local (Suresh), sales2@precon.local (Priya) |
| telecaller         | telecaller@precon.local (Tara), telecaller2@precon.local (Kavya), telecaller3@precon.local (Arjun): the round-robin rotation |
| factory_supervisor | supervisor@precon.local (Farid), tech@precon.local (Ravi, service technician) |

Every demo user follows their **role preset** exactly. The seed clears any per-user tag overrides.

### Role presets (requirement #20)

Admins don't pick individual tags. They pick a **role** on **Admin → Users**, and the role's preset decides every tag. **Changing someone's role resets their tags to the new preset** and clears any custom grants or revokes. The presets live in `api/src/access-control/permission-catalog.ts` (`ROLE_DEFINITIONS`). Re-running the seed re-syncs them.

| Role | Sees in the sidebar | Tags |
|------|---------------------|------|
| **admin** | Everything | All tags |
| **sales** | CRM (Leads, Won, Follow-ups, Calendar), Orders, Revenue (own), Site visits, own leave and allowances | `leads.read` `leads.write` `followups.write` `sales.read` `sales.write` `sitevisit.read` `sitevisit.write` + own leave and allowances |
| **telecaller** | Leads (read), Won, Follow-ups, Calendar, own leave and allowances. No finance, stock or HR admin | `leads.read` `followups.write` + own leave and allowances |
| **factory_supervisor** | Stock, Installations, Service jobs, Service follow-ups, Site visits, own leave and allowances. No CRM or finance | `stock.read` `stock.write` `installations.read` `installations.write` `service.read` `service.read_all` `service.write` `sitevisit.read` `sitevisit.write` + own leave and allowances |

- **Own leave and allowances** means `leave.apply`, `leave.read` (team calendar and holidays), `allowances.read` and `allowances.claim`.
- **"Own" scoping:** sales see only their own leads and orders because they have `leads.read` and `sales.read` without the matching `*_read_all` tag.
- **Revenue (own):** the Revenue page shows a salesperson only their own row. Admins with `finance.dashboard` still see every salesperson.
- **Service for supervisors:** supervisors get `service.read_all` because they run the service team.
- **Sales and service:** service jobs aren't in the sales preset.
- **Per-user overrides:** `PUT /users/:id/permissions` still exists for exceptions, and "View tags" on the Users screen shows anyone's effective tags.

The seed also adds 10 sample leads. Suresh has 5, Priya has 4, and 1 is unassigned. They cover every source, product and status. There are 14 follow-ups, dated relative to the day you seed, so some are always overdue, some due today and some upcoming. The seed adds sample leads only when the leads table is empty. Run `npm run db:reset` to start over.

The finance and stock seed adds the following. Dates are relative to the day you seed.

- **Stock:**
  - Sump 3,000 L: 6 (alert at 3)
  - Sump 4,000 L: 5 (alert at 3)
  - **Sump 5,000 L: 2 (alert at 3), low**
  - Sump 6,000 L: 4 (alert at 2)
  - Sump 8,000 L: 3 (alert at 2)
  - Sump 10,000 L: 7 (alert at 3)
  - **Sump 12,000 L: 2 (alert at 2), low**
  - Sump 15,000 L: 3 (alert at 1)
  - Sump 20,000 L: 2 (alert at 1)
  - Microbes: 40 packs (alert at 25)
- **4 sales orders from won leads:**
  - SO-0001 Senthil Farms (Suresh): 20 packs of microbes. ₹8,000 of ₹18,000 **overdue**
  - SO-0002 Divya Hospital (Priya): 2 × Sump 20,000 L. ₹2,20,000 of ₹4,20,000 **overdue**
  - SO-0003 Sri Murugan Residency (Suresh): 1 × Sump 5,000 L. ₹45,000 due in 10 days, not yet delivered
  - SO-0004 Kongu Engineering College (Priya): 1 × Sump 15,000 L, fully paid
- **2 won leads with no order yet**, for trying the conversion: Sakthi Hardware Stores (Suresh, microbes) and Palani Hill Resorts (Priya, Sump 10,000 L).
- **3 vendors:**
  - Ramco Cement: ₹1,30,000 owed, ₹50,000 of it **overdue**
  - Sri Balaji Steels: ₹1,40,000 owed, not yet due
  - KPN Transports: settled

Each part of the seed is skipped if its table already has data.

The service seed adds the following.

- **4 installations:**
  - Completed: Divya Hospital, Kongu Engineering College and Senthil Farms.
  - Sri Murugan Residency, **scheduled in 3 days**. Its order isn't delivered yet, so completing the installation will deliver it.
- **5 service jobs** on the completed installations:
  - SJ-0001 Divya complaint: high priority, in progress, with an **overdue** follow-up.
  - SJ-0002 Divya pre-monsoon cleaning: urgent, open, unassigned.
  - SJ-0003 Kongu warranty: resolved.
  - SJ-0004 Kongu annual check: open, with an **overdue** follow-up.
  - SJ-0005 Senthil Farms microbe check: open.
- **5 site-visit tags:** survey, measurement, complaint-visit, installation-check and soil-test.
- **4 site visits** that use the tags.

The HR seed adds the following.

- **12 company holidays for 2026.** This is a *sample* Tamil Nadu list; check it against the official one.
- **9 leave applications** covering every status:
  - Suresh: approved casual (last month), approved sick (this month), and pending casual (next week).
  - Priya: approved **unpaid** (2 days, LOP) and a rejected casual request with a reason.
  - Tara: pending casual.
  - Farid: approved casual coming up, and a cancelled sick request.
  - Ravi: approved **unpaid** (1 day, LOP).
- **2 absences without approval**, for Tara and Ravi. In October: Priya has 2 LOP days, Ravi 2 and Tara 1.
- **9 allowance entries:**
  - Approved, pending and rejected ones.
  - Some linked to Ravi's and Farid's site visits or installations.
  - One of Priya's is from last month.

## Product switch: operations modules (`OPERATIONS_ENABLED`)

One setting in **`api/.env`** decides whether the operations modules exist in the product. It's **off by default**: unset, `false`, or anything other than `true` / `1` / `yes` / `on` means off.

```bash
# api/.env
OPERATIONS_ENABLED=false   # live product: CRM only (default)
OPERATIONS_ENABLED=true    # bring finance, stock, vendors, service, installations and HR back
```
Then restart the API (`npm run start:dev`). The web app reads the setting from the API (`GET /api/v1/config`), so there's nothing to change in `web/`; just reload the browser.

| | **OFF** (default) | **ON** |
|---|---|---|
| Sidebar, every role including admin | Dashboard, CRM (Leads, Won, Follow-ups, Calendar, Site visits, Reports) and Admin (Users, Permissions & tags, Lead assignment, Message templates, API keys) | Also Finance, Operations, HR and Admin → Business overview, exactly as before |
| Operations pages (`/orders`, `/finance/*`, `/vendors`, `/stock`, `/installations`, `/service`, `/leave`, `/holidays`, `/hr/*`, `/allowances`, `/admin/overview`), even typed into the address bar | "This module isn't available" | Open, with the usual permissions |
| Operations API routes (sales orders, finance, vendors, stock, installations, service jobs and follow-ups, leave, holidays, LOP, allowances, HR) | **404** "This module is switched off", for everyone, admin included | Normal |
| Admin landing page | The sales/telecaller master dashboard | Same; the old finance/operations view is under Admin → Business overview |
| On CRM pages | The sales-order link and "Convert to order" on won leads, and the installation link on site visits, are hidden | Shown |

- **Not affected either way:** leads, import, public API and Meta webhook, round-robin, telecaller workbench, sales dashboard, master dashboard, follow-ups, calendar, reports and export, WhatsApp templates, notifications, GPS site visits.
- **Revenue while off:** revenue figures (sales dashboard, master scorecard, revenue report) come from sales orders. Existing orders still count, but with orders switched off no new ones can be recorded, so revenue won't grow until operations are switched on.
- **Roles:** the live roles are admin, sales and telecaller, with their CRM tags. The operations tags (finance, stock, service, installations, HR) stay in the role presets and on the Permissions page but have no effect while the switch is off. The factory supervisor role gets a "switched off" notice.
- **How it works:** operations controllers carry an `@OperationsFeature()` marker, and a global guard (`api/src/features/`) answers 404 for them while the switch is off. The web sidebar items and page paths are listed in `web/src/lib/features.ts`.

## How access control works

- Each user has one **role**. Each role has default **permission tags**, e.g. `users.read`.
- Admin can **grant** extra tags to a single user or **revoke** tags from them. Effective tags = role tags + granted tags − revoked tags.
- Each tag belongs to a **module**. A user's visible modules are the modules of their tags.
- Every route must declare exactly one policy. A route with no policy is refused (deny by default).
  - `@Public()`: no login needed
  - `@AuthenticatedOnly()`: any logged-in active user
  - `@RequirePermissions('tag', ...)`: needs all the listed tags. Checks tags, never role names.
  - `@RequireAnyPermission('tag', ...)`: needs at least one of the listed tags (e.g. an employee picker used by both approvers and allowance managers).
- Tags are read from the DB on every request, so admin changes take effect immediately.
- Logout revokes the token's `jti`. That token is rejected from then on.
- The tag catalog lives in `api/src/access-control/permission-catalog.ts`. To add a module, add its tags there, re-run the seed, and decorate its endpoints.
- The web UI hides nav items and buttons the user lacks tags for. That's only for convenience. The API enforces every rule.

### CRM tags (Phase 2)

| Tag | Allows |
|-----|--------|
| `leads.read` | See leads assigned to you, their follow-ups, the won list and the calendar |
| `leads.read_all` | Widens `leads.read` to every lead, including unassigned ones |
| `leads.write` | Create leads and edit leads you can see (details, notes, pipeline status) |
| `leads.qualify` | Telecaller preset. Update leads **assigned to you** after a call: name, email, city, product, size, notes and pipeline status. Phone and source stay locked (the phone is what duplicate checks match on); no creating, importing or reassigning |
| `leads.assign` | Choose or change who a lead is assigned to; see Admin → Lead assignment and switch telecallers in or out of the rotation |
| `leads.audit` | Admin. See a lead's full change history |
| `reports.view` | Sales and telecaller presets. Reports page with your own numbers, and exports of them |
| `reports.view_all` | Admin. Reports for everyone (revenue still needs `sales.read_all` or `finance.dashboard`) |
| `templates.manage` | Admin. Create and edit the WhatsApp message templates |
| `leads.receive_qualified` | Sales preset. Puts the holder in the round-robin for leads telecallers qualify. Not given to admin |
| `leads.auto_assign` | Puts the holder in the round-robin for incoming leads (telecaller preset). Not given to admin: admin manages the rotation, it doesn't receive leads |
| `followups.write` | Schedule, reschedule and complete follow-ups on leads you can see |

- **Who sees which leads** (by tags, not role names):
  - `leads.read_all` (admin): every lead.
  - Telecallers (`leads.auto_assign`): leads assigned to them **plus leads they worked and handed to a salesperson**, which they can still open and edit (status, notes, follow-ups, calls; not phone or source).
  - Everyone else, i.e. salespeople: **only leads assigned to them**. Not other salespeople's, not unassigned ones. The same goes for their dashboard, follow-ups and site-visit list.
- Admin sees all leads because they hold `leads.read_all`, not because of their role name.
- A salesperson's lead is auto-assigned to them, and they can't reassign it.
- A lead outside your scope returns 404, not 403, so its ID can't be probed.

### Finance and stock tags (Phase 3)

| Tag | Allows |
|-----|--------|
| `sales.read` | See sales orders credited to you |
| `sales.read_all` | Widens `sales.read` to every order |
| `sales.write` | Convert won leads into orders; edit or cancel orders you can see |
| `payments.read` | See amounts received, balances, and the company-wide balance-overdue list |
| `payments.write` | Record or remove customer payments |
| `vendors.read` / `vendors.write` | View / manage vendors, purchases and vendor payments |
| `stock.read` / `stock.write` | View stock / add production, adjust, set alert levels, **and mark orders delivered** |
| `finance.dashboard` | Revenue for every salesperson and the company-wide finance card. Without it, `sales.read` holders see only their own revenue |

- Admin holds all of these.
- Salespeople hold only `sales.read` and `sales.write`, scoped to their own orders. They don't see payment or balance fields. The API leaves those fields out unless the user holds `payments.read`.
- The factory supervisor holds the stock tags (see **Role presets** above for every role).
- Marking an order delivered needs `sales.read` plus `stock.write`. So by default only admin can deliver. To let the supervisor deliver, an admin grants them `sales.read` and `sales.read_all`.

### Service and installation tags (Phase 5)

| Tag | Allows |
|-----|--------|
| `installations.read` | See the installation schedule (calendar and list) and installation details |
| `installations.write` | Schedule, reassign, reschedule, start and complete installations |
| `service.read` | See service jobs for **customers you sold to** (you're the order's salesperson) **or jobs assigned to you** |
| `service.read_all` | Widens `service.read` to every job |
| `service.write` | Raise service jobs, update them, and schedule or complete their follow-ups (on jobs you can see) |
| `sitevisit.read` / `sitevisit.write` | View / record and edit site visits and choose their tags |
| `sitevisit.manage_tags` | Add, rename, recolour, retire or delete site-visit tags |

- Admin holds all of these.
- The factory supervisor holds the installation, service (all jobs) and site-visit tags.
- Salespeople hold the site-visit tags but no service tags. Grant `service.read` to an individual if they need to see their customers' jobs.

### HR tags

| Tag | Allows |
|-----|--------|
| `leave.apply` | Apply for and withdraw your own leave; see your own history, balance and monthly LOP |
| `leave.read` | Team calendar (holidays and who is on approved leave) and the holiday list |
| `leave.approve` | See every application, approve or reject (never your own), record absences without approval, and see everyone's LOP summary |
| `holidays.manage` | Add, edit and remove company holidays |
| `allowances.read` | See your own allowances and monthly total |
| `allowances.claim` | Submit your own allowance claims (pending until approved) |
| `allowances.manage` | See everyone's allowances, add for anyone (approved immediately), and approve or reject claims |

- Every employee gets `leave.apply`, `leave.read`, `allowances.read` and `allowances.claim`.
- Admin gets all the HR tags.
- The leave type is hidden on the team calendar except from approvers and the person themselves, so sick leave stays private.

## HR rules (leave, holidays, LOP, allowances)

The rules live in `api/src/hr/hr-config.ts` and `api/src/hr/lop.service.ts`. They are deliberately simple: the output feeds payroll later, but this is not payroll.

- **Working days:** every day except the weekly off and company holidays.
  - The weekly off defaults to Sunday. Change it with `WEEKLY_OFF_DAYS`, e.g. `0,6` for a 5-day week.
  - Leave and LOP **day counts are always computed from the dates**, never stored, so editing a holiday updates every number.
- **Leave:** the types are casual, sick and unpaid. Status runs `PENDING → APPROVED` or `REJECTED`, and the employee can `CANCEL` (withdraw) it.
  - Paid leave per calendar year: **12 casual and 6 sick**. Unused days don't carry over, and there's no pro-rating for joining date.
  - Applying for casual or sick leave is refused if it exceeds what's left after approved and pending leave. The error suggests applying the extra days as unpaid.
  - A date range that's all holidays or weekly offs is refused, as is one that overlaps your own pending or approved leave.
  - One application covers at most 60 calendar days.
  - Withdrawing works while pending, or while approved but not yet started.
  - Approvers can't decide their own leave, and rejecting needs a reason.
- **LOP, per employee per month (working days only):**
  - **Paid leave** = approved casual and sick days.
  - **LOP** = approved **unpaid** leave days + **absences without approval**. An absence is a working day an approver recorded as away without approved leave. It's only counted if no approved leave covers that day.
  - **Present-equivalent** = working days − paid leave − LOP. These are days assumed worked, since there's no attendance data yet.
  - **Paid days** = working days − LOP. This is what payroll will use.
  - Pending leave counts as neither. It's reported separately so it can be decided before the month closes.
  - Rejected or cancelled leave counts as nothing. If the person stayed away anyway, record an absence.
  - Absences can only be recorded for today or earlier, on a working day, once per person per day. When GPS attendance arrives with the mobile app, it can create these automatically.
- **Allowances:** the types are travel, food, site and other. Each records an amount, a date (not in the future), a description, and optionally a linked site visit or installation. Without `allowances.manage`, you can only link your own visits or installations assigned to you.
  - Employee claims start **pending**. Entries added by an `allowances.manage` holder are **approved** immediately.
  - Rejecting needs a reason. Employees can withdraw their own pending claims.
  - The monthly total counts **approved** entries only. Pending amounts are shown separately.

## Service and installation rules

- **Installations:** one per sales order. Any order that isn't cancelled can be scheduled. The flow is `SCHEDULED → IN_PROGRESS → COMPLETED`, and "start" can be skipped. Completed installations are locked.
  - An installation past its date and not yet completed is flagged **late**.
  - **Completing an installation is what makes the customer eligible for service jobs.**
  - If the order wasn't delivered yet, completing also delivers it and reduces stock in the same transaction. That needs `stock.write`.
- **Service jobs:**
  - A job can only be raised against a **completed** installation. With `service.read_all` that's any customer; otherwise only customers you sold to.
  - Types are complaint, maintenance and warranty. Priority runs low → urgent. Status runs `OPEN → IN_PROGRESS → RESOLVED`. Resolving records the time, and reopening clears it.
  - The assignee must hold `service.write`.
- **Service follow-ups:** work like sales follow-ups. Each is pending until an outcome is recorded, and it's overdue once its time passes. Overdue ones are shown in red.
- **Site visits:**
  - Each records a date, the person who visited (anyone active), customer or site, address, purpose, and optionally the installation it's about.
  - Tags come from the admin-managed list. A **retired** tag is hidden from new visits but stays on old ones. A tag that's in use can't be deleted, only retired.

## Finance and stock rules

- **Stock items:** every sump size is a separate stock item (SKU `SUMP-3000` … `SUMP-20000`), and microbes is `MICROBES`. The valid sizes are defined in `api/src/stock/product-catalog.ts`. An order points at exactly one stock item, so delivering it reduces that size's count. The Stock screen groups all sump sizes under **Sump**, and Microbes is shown separately.
- **Choosing a product:**
  - When converting a won lead, pick **Sump + size** or **Microbes**.
  - The size defaults to the lead's size. A sump order without a valid size is refused, and so is a size on a microbes order.
  - On a lead, the sump size is optional ("Not decided yet"), and switching a lead to microbes clears it.

- **Money:** stored as Decimal(12,2) rupees and sent over the API as strings ("125000.00"). Business dates (order, due, paid on) are plain dates in `YYYY-MM-DD`. "Today" uses `BUSINESS_TIMEZONE` (default `Asia/Kolkata`).
- **Sales orders:**
  - Only a `WON` lead can be converted, with one order per lead.
  - Revenue goes to the lead's salesperson. Crediting someone else needs `sales.read_all`.
  - The payment due date defaults to the order date + 30 days.
  - A lead with an active order can't be moved out of `WON`. Cancel the order first.
- **Balance due** = total − payments.
  - Overpayment is refused.
  - An order is **overdue** when a balance remains after its due date.
  - A cancelled order owes nothing. Only undelivered orders with no payments can be cancelled.
  - The total can't be lowered below what's already been received.
- **Delivery:** marking an order delivered reduces stock in the same transaction and logs a stock movement. It's refused if stock is short, so stock never goes negative. Product and quantity are locked after delivery.
- **Vendor outstanding** = purchases − payments to that vendor.
  - Payments are applied to the oldest bills first. That shows how much of each bill is unpaid, and the overdue amount is the unpaid part of bills past their pay-by date.
  - Paying more than is owed is refused.
- **Revenue by employee:** order value per salesperson, by order date, excluding cancelled orders. It also shows how much has been collected and how much is still outstanding.

## CRM rules

- **Pipeline:** `NEW → CONTACTED → QUALIFIED → QUOTED → WON`, or `LOST` from any stage. Any status can be set. Entering `WON` or `LOST` sets `closedAt`, and reopening clears it.
- **Follow-ups:** each one is *pending* until an outcome is recorded (connected, no answer, call back, interested, not interested, quote sent, other). It's *overdue* when pending and its time has passed. A completion can be reopened if it was recorded by mistake.
- **Phone numbers:** stored normalized. `98765 43210` becomes `9876543210`.
- **Duplicates from outside:** import, the public API and the Meta webhook never create a second lead for the same phone. Phones match on their **last 10 digits**, so `+919876543210`, `919876543210` and `9876543210` are the same customer. The lead's detail page shows where it came from, for example "Import: march.xlsx", "API key: Website form" or "Meta lead form 123".

## Getting leads in: import, public API, Meta webhook

All three go through one intake service (`api/src/intake/`), so validation, duplicate handling and **round-robin assignment** are the same everywhere.

### Round-robin assignment to telecallers

The business gets 50-60 leads a day from Meta click-to-WhatsApp ads, with name and phone only, shared across 3 telecallers.

- **Who is in the rotation:** active users holding `leads.auto_assign` (the telecaller preset) whom the admin has left **switched on** under Admin → Lead assignment. Switch someone off for leave, and they're skipped until switched back on.
- **Rule:** every new lead from an import, the API or Meta **without a chosen person** goes to the member who has waited longest since their last round-robin lead. With A, B and C that gives A, B, C, A, B, C… within one upload, across uploads and API calls, and through the day. Someone newly added, or switched back on after missing turns, is next.
- **Fair under load:** the pick and the new lead are saved in one database transaction behind a lock, so two leads arriving at the same moment never get the same turn. A duplicate (phone already a lead) is skipped and uses no turn.
- **Not in the rotation:** leads typed in by hand on "New lead" follow the old rule, and import rows that name a salesperson go to that person.
- **Manual change:** admin opens a lead and changes "Assigned to". The lead is then no longer counted as round-robin (`autoAssigned` cleared).
- **No one switched on:** leads arrive unassigned, and the import result and the Lead assignment page say so.
- **Admin view:** Admin → Lead assignment (`leads.assign`) shows a day's leads (today by default), how many came by round-robin, how many are unassigned, and each telecaller's count with an "Even ✓" check. It also shows who is next and each person's on/off switch.

### 1. Bulk import (Leads → Import)

- **Who:** anyone with `leads.write` (admin, sales). Telecallers don't have it.
- **Meta exports work as they are:** only `name` and `phone` are required, and Meta's `full_name` / `phone_number` headings, its `p:+91…` phone values and its UTF‑16 tab-separated CSV download are understood. Other Meta columns (id, ad name…) are ignored and listed. Pick **"Source for rows without one"** (Meta by default) on the import screen.
- **Sample file:** `web/public/samples/meta-leads-sample.csv` (also linked on the import screen). It has 30 name + phone rows; 2 phones already exist in the demo data and 1 is repeated, so on fresh demo data it gives **27 created, 3 skipped, 9 / 9 / 9**.
- **Template:** `.xlsx` (with dropdowns and a "How to fill" sheet) or `.csv`. Columns: `name`*, `phone`*, `city`, `product` (Sump or Microbes; blank = not known yet, and a size on its own means Sump), `sump size` (3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000 or 20000; "10,000 L" also works), `source` (Meta, Manual, Website, Referral, Other; blank uses the import screen's choice), `assigned salesperson` (email or full name), `notes`. Header names are matched loosely ("Mobile", "Sump Size (litres)" and so on); unknown columns are ignored and listed.
- **Assigning:** a blank salesperson means **round-robin** to the telecallers. With `leads.assign` (admin) you can name anyone. Without it (sales) you can only name yourself, to keep a row; naming someone else fails that row.
- **Result:** counts of created, skipped as duplicates (phone already a lead, or repeated earlier in the same file), and failed rows with their row number and reasons. It also shows **who got how many** of the new leads, and who each created lead went to. Valid rows are imported even when other rows fail.
- **Nothing is imported** when the file isn't a readable `.csv`/`.xlsx` (old `.xls` gets a "Save As .xlsx" hint), when the `name` or `phone` heading is missing, when there are no rows, when it's over 2 MB, or when it has over 2,000 rows. The template's "Example - …" rows are refused.

### 2. Public create-lead API (requirement #21)

- **Keys:** Admin → API keys (`apikeys.manage`, admin only). Generate a key, which is shown **once**. Only its SHA-256 hash and first characters are stored. Revoking takes effect immediately, and "last used" is recorded.
- **Endpoint:** `POST http://<server>:4000/api/v1/public/leads`, or through the web app at `http://<server>:3000/api/v1/public/leads`.
- **Headers:** `Content-Type: application/json` and `X-API-Key: precon_…`.
- **Body:** `name`*, `phone`*, `product` (`SUMP`|`MICROBES`; leave it out if not known), `sumpSizeLitres`, `city`, `email`, `notes`, `source` (`API` default, `WEBSITE`, `REFERRAL`, `OTHER`), `externalId` (your id; resending it counts as a duplicate).
- **Responses:**
  - `201 {"status":"created","leadId","assignedTo"}`: `assignedTo` is the telecaller the round-robin picked
  - `200 {"status":"duplicate","reason":"phone"|"externalId","leadId"}`: nothing is created.
  - `400`: validation errors, listed.
  - `401`: missing, wrong or revoked key.
  - `429`: rate limited, with a `Retry-After` header.
- **Rate limit:** `PUBLIC_API_RATE_LIMIT` per key per minute (default 60).
- **Owner:** new API leads go round-robin to the telecallers. They are recorded as created by the admin who made the key.

```bash
curl -X POST http://localhost:4000/api/v1/public/leads \
  -H "Content-Type: application/json" \
  -H "X-API-Key: precon_devsample_website_7f3c9a1e5b2d4f60" \
  -d '{"name":"Ravi Kumar","phone":"+91 98765 43210","product":"SUMP","sumpSizeLitres":10000,"city":"Coimbatore","externalId":"form-0042"}'
```

**Dev sample keys:** seeded only outside production, and only when no keys exist. These values are public, so never use them for real.

| Key | State |
|-----|-------|
| `precon_devsample_website_7f3c9a1e5b2d4f60` | active ("Website contact form (dev sample)") |
| `precon_devsample_revoked_2b8e6d4a9c1f3e70` | revoked, so it gets a 401 |

### 3. Meta (Facebook) Lead Ads webhook (receiving end)

- `GET /api/v1/webhooks/meta`: Meta's subscription check. It replies with `hub.challenge` as plain text when `hub.mode=subscribe` and `hub.verify_token` equals `META_VERIFY_TOKEN`. A wrong token gets 403, and 503 means the token isn't configured.
- `POST /api/v1/webhooks/meta`: "leadgen" notifications.
  1. The `X-Hub-Signature-256` header is checked against `META_APP_SECRET`.
  2. Meta sends only a lead id, so the answers are fetched from the Graph API with `META_PAGE_ACCESS_TOKEN`.
  3. The lead is created with source **Meta**. Duplicates are skipped by leadgen id or phone.
  4. Form fields used: `full_name`, `phone_number`, `email`, `city`, plus optional custom questions `product` and `sump_size`. A lead without them has product "not known yet", and it goes round-robin to a telecaller. Any other answers go into notes. The product defaults to Sump.
  5. Errors for a single lead are logged and reported in the response; they never crash the API.
- With the settings missing, both endpoints answer **503 "not configured"**, and the rest of the API keeps working. Admin → API keys shows which settings are present, never their values.
- **Dev test without Meta:** `npm run meta:test-webhook` (in `/api`) signs a fake notification with your local `META_APP_SECRET` and posts it. The answers are sent inline, which the API accepts **only when `NODE_ENV` isn't `production`**. Add a phone, e.g. `npm run meta:test-webhook -- 9876543210`, to see a duplicate.

**Environment variables (`api/.env`):**

| Variable | What it is |
|----------|------------|
| `META_VERIFY_TOKEN` | Any random string you make up. Enter the same one in the Meta app's webhook setup |
| `META_APP_SECRET` | Meta app → App settings → Basic → App secret. Verifies that requests really come from Meta |
| `META_PAGE_ACCESS_TOKEN` | A long-lived **Page** access token with `leads_retrieval`, used to fetch each lead's answers |
| `META_GRAPH_API_VERSION` | Graph API version, default `v23.0`. Check Meta's current version |
| `PUBLIC_API_RATE_LIMIT` | Public API requests per key per minute (default 60) |

**Manual setup on Meta's side (required to activate it):**
1. **Public HTTPS URL:** Meta must reach `https://<your-domain>/api/v1/webhooks/meta`. A LAN address (192.168.x.x) won't work. This needs hosting or a tunnel, which isn't set up yet.
2. **Meta app:** create one (type Business) at developers.facebook.com, connected to the company's Business Manager.
3. **Webhooks product:** add it to the app → choose **Page** → subscribe to the **`leadgen`** field. Enter the callback URL and your `META_VERIFY_TOKEN`; Meta calls the GET endpoint to verify.
4. **Permissions:** `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`. Using them with real customers needs **App Review** and **Business Verification**.
5. **Page access token:** get a long-lived one (ideally from a system user in Business Manager) and put it in `META_PAGE_ACCESS_TOKEN`. Copy the App secret into `META_APP_SECRET`.
6. **Subscribe the Page to the app:** `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` with the page token.
7. **Lead access:** in Business Manager → Integrations → Leads Access, give the app (or CRM) access to the page's leads.
8. **Test:** use Meta's Lead Ads Testing Tool (developers.facebook.com/tools/lead-ads-testing) and check that the lead appears with source Meta.

## Telecaller → sales workflow

- **Log call** (`followups.write`): outcome No answer, Busy, Call back later, Interested, Not interested or Wrong number, with an optional note and next callback. Logging a call completes the lead's open callback. A first call moves New → Contacted; **Not interested** and **Wrong number** close the lead as Lost (it leaves the worklist).
- **Callbacks** are ordinary follow-ups, so they show on Follow-ups and the Calendar too. "Set/Change callback" moves the open one instead of adding another.
- **Qualify** (`leads.qualify` on your own leads, or `leads.write`): product (required), sump size, city and notes; status becomes Qualified and the lead is **handed to sales**: the next salesperson in the sales round-robin (holders of `leads.receive_qualified` who are switched on), or one the telecaller picks. The telecaller's callbacks close, an optional "when should sales call" follow-up goes on the salesperson's list, and the notes record who qualified it. The lead leaves the telecaller's worklist; who received and qualified it is kept for the scorecards.
- **Change the salesperson afterwards:** on a handed-over lead, the telecaller who handled it (or an admin) can click **Change** next to "Salesperson". The new salesperson must be able to receive qualified leads and is notified; the old one loses access.
- **After handover both can work the lead:** the salesperson owns it (their dashboard, follow-ups, reminders); the telecaller still sees it in their Leads list and can open and edit it. Each sees the other's updates on the lead page. A telecaller's call on a handed lead doesn't close the salesperson's follow-ups.
- **Sales rotation:** Admin → Lead assignment has a second table, "Salespeople receiving qualified leads", with the same on/off switch and "next" marker as the telecallers.
- **Call history** of every lead (who, when, outcome, note) is on the lead page.
- **GPS check-in** ("I'm at site", `sitevisit.write`): the browser reads the location **once** when the button is pressed and stores latitude, longitude, accuracy and time on a site visit **for a lead**. You must pick the lead, and the list holds only the leads assigned to you (not lost). It's on the sales dashboard, the Site visits page, and the lead's own page. The visit shows on that lead ("Calls, messages & visits", plus a Site visits section with a map) for everyone connected to it, and in its change history. No tracking. Maps are OpenStreetMap with Leaflet (no Google, no API key). Browsers only share location on a secure page: it works on `http://localhost:3001` on the Mac and on HTTPS later, but **not on the LAN address** (`http://192.168.x.x`); there the button says so.
- **Sidebar:** telecallers and sales see Dashboard, Leads, Follow-ups, Calendar (sales also Won and Site visits) and their own leave/allowances. The Finance section needs `finance.dashboard`, so it is off their screens; stock and service need their own tags. Pages and APIs are unchanged.

## Date filters (Won and Follow-ups)

- **Won** filters by the date each lead was won; **Follow-ups** by the date each follow-up is due.
- **Presets:** Today, This week (Monday to Sunday), This month, Last month, This year, and All time (the default). Or pick a custom **From / To** range, which overrides the presets. Either end can be left open.
- **Display:** the bar shows what's active ("Showing: Last month (1 Sept - 30 Sept 2026)") with a count of matching records ("4 won leads", "7 overdue follow-ups"). **Clear (all time)** resets it.
- **Narrowing only:** the filter narrows what you can already see, so a salesperson still sees only their own and admin sees all. It combines with the other filters (Follow-ups' Overdue / Upcoming / Completed tabs and "Only my leads"; the API's status, source, product, salesperson and search on leads). Won stays sorted newest win first, and follow-ups by due date.
- **Days** are calendar days in the business time zone, so 00:10 on 1 April belongs to April. Both ends are inclusive.
- **Export:** these two pages have no export. The Reports page has its own date range and CSV / Excel export.

## Lead change history (admin only)

- Every meaningful change on a lead is recorded with **who**, **what** (from → to where it applies) and **when**:
  - lead created (by hand, import, API, Meta);
  - assignment and round-robin; handover to a salesperson; salesperson changed;
  - status changes; field edits (name, phone, email, city, source, product, size); notes edits;
  - follow-ups created, moved, completed (with outcome) and reopened;
  - calls logged (with outcome and any status change); WhatsApp messages started; site visits (GPS, accuracy, note).
- Entries are written in the same database transaction as the change, so the history can't miss one or show one that didn't happen.
- **Admin sees it** as a timeline at the bottom of the lead page ("Change history · Admin only"), newest first, with a "Show all" button past 25 entries. This needs the `leads.audit` tag (admin preset).
- **Telecallers and salespeople don't see the timeline.** They see the lead's current state, its calls, WhatsApp messages, site visits and follow-ups (`GET /leads/:id/history` answers 403).

## WhatsApp quick-contact

- A green **WhatsApp** button sits next to the phone on the telecaller workbench and on every lead page. It opens a picker of the admin's **message templates** (plus "open chat without a message").
- Picking one fills the template from the lead on the server, records it under the lead's **Calls & messages**, and opens `https://wa.me/<number>?text=<message>`. WhatsApp opens with the message typed in; the sender still taps Send, so the log means "started", not "delivered".
- **Numbers:** Indian numbers get country code 91 when missing (`98765 43210`, `098765 43210`, `+91 98765 43210` all become `919876543210`); other international numbers are kept; landlines and short numbers are refused with a message.
- **Templates:** Admin → Message templates (`templates.manage`, admin only; telecallers and sales can use templates but not create, edit or delete them):
  - **Create / edit** (including the 3 starters: Intro, Follow-up, Quotation): a name, the message, and an order number. Buttons insert a placeholder at the cursor; the live preview fills them with a sample lead before you save. A name (2+ characters) and a message (5+ characters) are required, checked on the page and again by the API; names must be unique.
  - **Switch off / on**: hides a template from the WhatsApp picker without deleting it.
  - **Delete** asks to confirm; past messages keep the template's name. Deleting or switching off the last template people can pick gives an extra warning, and the page shows a banner if none is switched on.
  - **The picker** shows only switched-on templates, by order number then name.
- **Placeholders:** `{name}`, `{first_name}`, `{city}`, `{product}` (e.g. "Sump · 10,000 L"), `{my_name}` (the sender), `{company}` (`COMPANY_NAME` in `api/.env`, default "Precon"). Any case and spacing work (`{ Name }`); a misspelt placeholder is left visible so it gets noticed.

## Reports & export

- **Reports page** (`/reports`): leads by source, leads & conversion per telecaller, pipeline status breakdown, revenue by salesperson, follow-up compliance. Date presets (this month, last month, last 7 / 90 days, this financial year) or any from/to range up to 3 years, in the business time zone.
- **Export:** every report downloads as **CSV** (UTF-8 with BOM so Excel shows ₹ correctly; percentages as numbers, e.g. `45.5`) or **Excel .xlsx** (title, period, bold header and total, rupee and percent formats). Exports contain exactly what the user can see on screen.
- **Who sees what** (tags, not roles):
  - `reports.view_all` (admin): everyone's numbers.
  - `reports.view` (sales and telecaller presets): only rows about you: your leads (assigned, received or qualified by you), your own telecaller row, your own follow-ups, your own revenue.
  - **Revenue** also needs `sales.read` (your own) or `sales.read_all` / `finance.dashboard` (everyone's). Telecallers don't have it, so they don't get the revenue report. A **manager** given `reports.view_all` without finance tags gets every report except revenue.
- **Definitions:** qualified = has been qualified (or is past Qualified); win rate = won ÷ leads; telecaller conversion = share of the leads they received in the period that have been qualified; follow-up compliance = done ÷ due (follow-ups that came due in the period, up to now); "on time" = done within 24 hours of being due.

## In-app notifications & reminders

- **Bell** (top right; in the top bar on phones), checked every minute and when opened:
  - **Reminders:** each callback / follow-up on your leads that is due today or overdue (overdue in red). A reminder disappears by itself once the follow-up is done (e.g. you log the call) or the lead moves to someone else.
  - **Updates:** a lead was assigned to you (round-robin, import, API, Meta or by hand) or a telecaller handed you a qualified lead. You are never notified about your own actions.
  - Click an item to open the lead (and mark it read), or **Mark all as read**.
- **My reminders today** card on the telecaller, sales and master dashboards: overdue and due-later-today follow-ups (tap to open), plus how many leads were assigned or handed to you today.
- **How it works:** updates are written in the same transaction as the assignment or handover. Reminders are created when you check, at most one per follow-up, so no background job or scheduler is needed.
- **WhatsApp / email delivery of notifications is a later, deployment-time add-on.** It needs a hosted server with a scheduler and a provider account (e.g. WhatsApp Business API, an email service). Nothing is sent outside the app today.

## API endpoints (prefix `/api/v1`)

| Method | Path                     | Access                 | Purpose |
|--------|--------------------------|------------------------|---------|
| GET    | `/health`                | public                 | API + DB up check |
| GET    | `/config`                | public                 | `{operationsEnabled}`: whether the operations modules are switched on (`OPERATIONS_ENABLED`) |
| POST   | `/auth/login`            | public                 | `{email, password}` → `{accessToken, expiresAt, user}` |
| POST   | `/auth/logout`           | logged in              | Revokes the current token (204) |
| GET    | `/auth/me`               | logged in              | Current user, role, effective tags, modules |
| GET    | `/users`                 | `users.read`           | List users, with role and `customTagCount` |
| POST   | `/users`                 | `users.manage`         | Create: `{fullName, email, roleKey, password, phone?}`. Tags come from the role preset |
| PATCH  | `/users/:id`             | `users.manage`         | `{fullName?, phone?, roleKey?, isActive?, password?}`. Changing `roleKey` resets tags to that preset. You can't change your own role or deactivate yourself |
| GET    | `/users/:id/permissions` | `permissions.read`     | Role tags, overrides, effective tags |
| PUT    | `/users/:id/permissions` | `permissions.assign`   | Replace overrides: `{grant: [...], revoke: [...]}`. You can't change your own. |
| GET    | `/roles`                 | `permissions.read`     | Roles with default tags and user counts |
| GET    | `/permissions`           | `permissions.read`     | Full tag catalog |
| GET    | `/leads`                 | `leads.read`           | List leads in your scope. Filters: `status`, `source`, `productInterest`, `assignedToId`, `search` (name/phone/city), `wonFrom` / `wonTo` (YYYY-MM-DD, won-on date, inclusive), `page`, `pageSize`. `status=WON` = closed/won view, newest win first |
| GET    | `/leads/summary`         | `leads.read`           | Dashboard counts: leads by status, open leads, overdue and upcoming follow-ups |
| GET    | `/leads/assignees`       | `leads.assign`         | Active users who hold `leads.read` (assign dropdown) |
| GET    | `/leads/:id`             | `leads.read`           | One lead with all its follow-ups |
| POST   | `/leads`                 | `leads.write`          | Create: `{name, phone, source, productInterest? (SUMP|MICROBES, null = not known yet), sumpSizeLitres?, email?, city?, status?, notes?, assignedToId?}`. `assignedToId` for someone else needs `leads.assign` |
| PATCH  | `/leads/:id`             | `leads.write` or `leads.qualify` | Edit any field or move it in the pipeline. Changing `assignedToId` needs `leads.assign`. With only `leads.qualify`: your own leads only, and changing `phone` or `source` gets 403 |
| GET    | `/leads/import/template` | `leads.write`          | `format=xlsx` (default) or `csv`: import template download |
| POST   | `/leads/import`          | `leads.write`          | Multipart `file` (.csv/.xlsx), optional `defaultSource` → `{totalRows, created, createdRows[{…, assignedTo}], duplicates[], failed[{row, errors}], ignoredColumns, assignments[{fullName, count}], autoAssigned, unassigned}`. 400 and nothing imported for a bad file |
| POST   | `/leads/:id/calls`       | `followups.write`      | Log a call: `{outcome, note?, nextCallbackAt?}`. Completes the open callback; New → Contacted; NOT_INTERESTED / WRONG_NUMBER → Lost |
| GET    | `/leads/:id/calls`       | `leads.read`           | The lead's call history, newest first |
| GET    | `/leads/:id/history`     | `leads.audit`          | Full change history (admin): `[{type, message, changes[{field, label, from, to}], createdAt, user}]`, newest first |
| GET    | `/leads/:id/visits`      | `leads.read`           | Site visits (GPS check-ins) recorded on the lead |
| PUT    | `/leads/:id/salesperson` | `leads.qualify` (the lead's telecaller) or `leads.assign` | `{salesUserId}`: change the salesperson on a handed-over lead |
| GET    | `/check-ins/leads`       | `sitevisit.write`      | Leads you can record a visit for (assigned to you, not lost) |
| PUT    | `/leads/:id/next-callback` | `followups.write`    | `{scheduledAt, note?}`: move the open callback, or add one (must be in the future) |
| POST   | `/leads/:id/qualify`     | `leads.qualify` or `leads.write` | `{productInterest, sumpSizeLitres?, city?, notes?, salesUserId?, salesFollowUpAt?}` → `{status, handedTo, roundRobin}`. Only New/Contacted leads |
| GET    | `/sales-team`            | `leads.qualify` or `leads.write` | Salespeople who can receive qualified leads, and who is next |
| POST   | `/check-ins`             | `sitevisit.write`      | `{latitude, longitude, accuracyMeters?, leadId, note?}`: one GPS reading stored as a visit to `leadId`, which must be one of your assigned leads (404 otherwise) |
| GET    | `/check-ins/mine`        | `sitevisit.read`       | Your recent check-ins with location |
| GET    | `/dashboards/telecaller` | `leads.read`           | Workbench: counts and your worklist in call order |
| GET    | `/dashboards/sales`      | `leads.read`           | Your pipeline, follow-ups due, revenue this month (with `sales.read`), check-ins |
| GET    | `/dashboards/master`     | `leads.read_all` + `leads.assign` | Scorecards, accountability flags, today's split, site-visit map |
| GET    | `/message-templates`     | `leads.read`           | Active WhatsApp templates (`?all=true` with `templates.manage` includes switched-off ones) |
| GET    | `/message-templates/placeholders` | `leads.read`  | Placeholders and what they fill in |
| POST   | `/message-templates`     | `templates.manage`     | `{name, body, sortOrder?, isActive?}` (409 if the name exists) |
| PATCH  | `/message-templates/:id` | `templates.manage`     | Edit, reorder, switch off |
| DELETE | `/message-templates/:id` | `templates.manage`     | Delete (past messages keep its name) |
| POST   | `/leads/:id/whatsapp`    | `leads.read`           | `{templateId?, message?}` → `{url, message, phone}`; logs the message on the lead. 400 if the number can't be used |
| GET    | `/leads/:id/messages`    | `leads.read`           | WhatsApp messages started on the lead |
| GET    | `/reports`               | `reports.view` or `reports.view_all` | Reports you can open, and your scope (`all` / `own`) |
| GET    | `/reports/:key`          | `reports.view` or `reports.view_all` | `from`, `to` (YYYY-MM-DD), optional `format=csv\|xlsx`. Keys: `leads-by-source`, `telecallers`, `pipeline`, `revenue`, `follow-ups` |
| GET    | `/notifications`         | logged in              | `{unread, reminders[], updates[]}` |
| GET    | `/notifications/summary` | logged in              | `{overdue[], dueToday[], assignedToday, handedToday}` |
| POST   | `/notifications/:id/read` | logged in             | Mark one of yours read (404 for anyone else's) |
| POST   | `/notifications/read-all` | logged in             | Mark all yours read |
| GET    | `/lead-assignment`       | `leads.assign`         | `date=YYYY-MM-DD` (default today): `{total, autoAssigned, unassigned, spread, nextUp, members[{fullName, autoAssignEnabled, leads, autoAssignedLeads, lastAutoAssignedAt}], others[]}` |
| PATCH  | `/lead-assignment/members/:userId` | `leads.assign` | `{enabled}`: switch a telecaller or salesperson in or out of their round-robin (they must hold `leads.auto_assign` or `leads.receive_qualified`) |
| GET    | `/api-keys`              | `apikeys.manage`       | Keys with prefix, status, last used (never the key or hash) |
| POST   | `/api-keys`              | `apikeys.manage`       | `{name}` → key details plus `key`, the full key, returned only this once |
| POST   | `/api-keys/:id/revoke`   | `apikeys.manage`       | Revoke a key |
| GET    | `/api-keys/meta-status`  | `apikeys.manage`       | Which Meta env vars are set (true/false only) |
| POST   | `/public/leads`          | **API key** (`X-API-Key`) | Create a lead from an external system. See "Getting leads in" |
| GET    | `/webhooks/meta`         | public (verify token)  | Meta webhook verification (`hub.challenge`) |
| POST   | `/webhooks/meta`         | public (Meta signature) | Meta Lead Ads `leadgen` notifications |
| GET    | `/follow-ups`            | `leads.read`           | Follow-ups in your scope. `state=pending\|overdue\|upcoming\|completed`, `from`/`to` (ISO, for the calendar), `fromDate`/`toDate` (YYYY-MM-DD due date, inclusive), `assignedTo=me` |
| POST   | `/leads/:leadId/follow-ups` | `followups.write`   | Schedule: `{scheduledAt, note?}` |
| PATCH  | `/follow-ups/:id`        | `followups.write`      | Reschedule or edit the note |
| POST   | `/follow-ups/:id/complete` | `followups.write`    | Record the outcome: `{outcome, note?}` |
| POST   | `/follow-ups/:id/reopen` | `followups.write`      | Undo a completion |
| GET    | `/sales-orders`          | `sales.read`           | Orders in your scope. Filters: `status`, `from`/`to` (order date), `salespersonId`, `page`, `pageSize`. Includes `amountPaid`/`balanceDue`/`isOverdue` only with `payments.read` |
| GET    | `/sales-orders/summary`  | `sales.read`           | Your orders and value this month, and orders awaiting delivery |
| GET    | `/sales-orders/:id`      | `sales.read`           | One order; its payments are included with `payments.read` |
| POST   | `/sales-orders`          | `sales.write` + `leads.read` | Convert a WON lead: `{leadId, quantity, totalAmount, product? (SUMP|MICROBES), sizeLitres? (required for a sump unless the lead has one), orderDate?, dueDate?, notes?, salespersonId?}` |
| PATCH  | `/sales-orders/:id`      | `sales.write`          | Edit total, dates, notes, salesperson. Product, `sizeLitres` and quantity only before delivery |
| POST   | `/sales-orders/:id/deliver` | `sales.read` + `stock.write` | Mark delivered and reduce stock |
| POST   | `/sales-orders/:id/cancel` | `sales.write`        | Cancel an undelivered order with no payments |
| POST   | `/sales-orders/:id/payments` | `sales.read` + `payments.write` | Record a payment: `{amount, paidOn, mode, reference?, note?}` |
| DELETE | `/payments/:id`          | `sales.read` + `payments.write` | Remove a payment recorded by mistake |
| GET    | `/finance/summary`       | `finance.dashboard`    | Revenue this month, receivable, overdue receivable, payable, overdue payable |
| GET    | `/finance/revenue-by-employee` | `finance.dashboard` or `sales.read` | `from`/`to` (order date). Per salesperson: orders, revenue, collected, outstanding. Without `finance.dashboard` you get only your own row (`scope: "own"`) |
| GET    | `/finance/overdue-balances` | `payments.read`     | Orders with a balance past due, company-wide. `sort=oldest\|largest` |
| GET    | `/vendors`               | `vendors.read`         | Vendors with purchased, paid, outstanding, overdue, oldest unpaid due |
| GET    | `/vendors/:id`           | `vendors.read`         | Vendor with each purchase's unpaid and overdue amount, and its payments |
| POST   | `/vendors`               | `vendors.write`        | `{name, category, contactPerson?, phone?, email?, notes?}` |
| PATCH  | `/vendors/:id`           | `vendors.write`        | Edit a vendor |
| POST   | `/vendors/:id/purchases` | `vendors.write`        | `{item, amount, purchaseDate, dueDate, invoiceNumber?, notes?}` |
| POST   | `/vendors/:id/payments`  | `vendors.write`        | `{amount, paidOn, mode, reference?, note?}` |
| DELETE | `/vendor-payments/:id`   | `vendors.write`        | Remove a vendor payment recorded by mistake |
| GET    | `/stock`                 | `stock.read`           | Stock items (`sku`, `code`, `sizeLitres`, name, quantity on hand, alert level, `isLow`): sumps smallest to largest, then microbes |
| GET    | `/stock/movements`       | `stock.read`           | Latest 50 movements (`productId` optional) |
| POST   | `/stock/:productId/movements` | `stock.write`     | `{change, reason: PRODUCTION\|ADJUSTMENT, note?}`. Refused if it would go below 0 |
| PATCH  | `/stock/:productId`      | `stock.write`          | `{lowStockThreshold?, name?, unit?}` |
| GET    | `/installations`         | `installations.read`   | Schedule. Filters: `status`, `from`/`to` (date), `assignedTo=me`. Includes `isLate` |
| GET    | `/installations/summary` | `installations.read`   | Scheduled in the next 7 days, in progress, late, completed |
| GET    | `/installations/eligible-orders` | `installations.write` | Orders that can be scheduled |
| GET    | `/installations/assignees` | `installations.write` | People who can lead an installation |
| GET    | `/installations/:id`     | `installations.read`   | One installation with its service jobs |
| POST   | `/installations`         | `installations.write`  | `{salesOrderId, scheduledDate, siteAddress, assignedToId?, teamName?, notes?}` |
| PATCH  | `/installations/:id`     | `installations.write`  | Reschedule, reassign or edit (not once completed) |
| POST   | `/installations/:id/start` | `installations.write` | SCHEDULED → IN_PROGRESS |
| POST   | `/installations/:id/complete` | `installations.write` (+ `stock.write` if the order isn't delivered) | → COMPLETED: `{completionNotes?}` |
| GET    | `/service-jobs`          | `service.read`         | Jobs in your scope, unresolved and urgent first. Filters: `status`, `type`, `priority`, `assignedTo=me` |
| GET    | `/service-jobs/summary`  | `service.read`         | Open, in progress, urgent/high, overdue and upcoming service follow-ups |
| GET    | `/service-jobs/eligible-installations` | `service.write` | Completed installations you can raise jobs against |
| GET    | `/service-jobs/assignees` | `service.write`       | People who can be assigned service work |
| GET    | `/service-jobs/:id`      | `service.read`         | One job with its follow-ups |
| POST   | `/service-jobs`          | `service.write`        | `{installationId, type, description, priority?, assignedToId?}` |
| PATCH  | `/service-jobs/:id`      | `service.write`        | `{type?, priority?, status?, description?, assignedToId?, resolutionNotes?}` |
| GET    | `/service-follow-ups`    | `service.read`         | `state=pending\|overdue\|upcoming\|completed`, `from`/`to`, `assignedTo=me` |
| POST   | `/service-jobs/:id/follow-ups` | `service.write`  | `{scheduledAt, note?}` |
| PATCH  | `/service-follow-ups/:id` | `service.write`       | Reschedule or edit the note |
| POST   | `/service-follow-ups/:id/complete` | `service.write` | `{outcome, note?}` |
| POST   | `/service-follow-ups/:id/reopen` | `service.write` | Undo a completion |
| GET    | `/site-visits`           | `sitevisit.read`       | Filters: `tagId`, `personId`, `from`/`to` |
| GET    | `/site-visits/people`    | `sitevisit.write`      | Who can be recorded as the visitor |
| GET    | `/site-visits/:id`       | `sitevisit.read`       | One visit |
| POST   | `/site-visits`           | `sitevisit.write`      | `{visitDate, customerName, siteAddress, purpose, tagIds, personId?, notes?, installationId?}` |
| PATCH  | `/site-visits/:id`       | `sitevisit.write`      | Edit, including tags |
| GET    | `/site-visit-tags`       | `sitevisit.read`       | Active tags (`includeInactive=true` for all, with usage counts) |
| POST   | `/site-visit-tags`       | `sitevisit.manage_tags` | `{name, description?, color?}`. The name is lowercased and hyphenated |
| PATCH  | `/site-visit-tags/:id`   | `sitevisit.manage_tags` | `{name?, description?, color?, isActive?}`. `isActive: false` retires the tag |
| DELETE | `/site-visit-tags/:id`   | `sitevisit.manage_tags` | Delete an unused tag (409 if in use) |
| GET    | `/leave/mine`            | `leave.apply`          | Your applications for a year (`year=`), each with `days` (working days) |
| GET    | `/leave/balance`         | `leave.apply`          | Casual and sick entitlement, taken, pending, remaining, available, and unpaid days. `userId=` needs `leave.approve` |
| GET    | `/leave/lop/mine`        | `leave.apply`          | Your LOP summary for `month=YYYY-MM` |
| GET    | `/leave/calendar`        | `leave.read`           | `from`/`to` (at most about 2 months): holidays and approved leave (plus pending for approvers) |
| POST   | `/leave`                 | `leave.apply`          | Apply: `{type, startDate, endDate, reason}` |
| POST   | `/leave/:id/cancel`      | `leave.apply`          | Withdraw your own (pending, or approved and not started) |
| GET    | `/leave/applications`    | `leave.approve`        | Everyone's, pending first. Filters: `status`, `userId`, `from`/`to` |
| POST   | `/leave/:id/approve`     | `leave.approve`        | `{note?}` (not your own) |
| POST   | `/leave/:id/reject`      | `leave.approve`        | `{note}` (required) |
| GET    | `/holidays`              | `leave.read`           | Holidays for `year=` |
| GET    | `/holidays/upcoming`     | `leave.read`           | Next 3 holidays |
| POST   | `/holidays`              | `holidays.manage`      | `{date, name}` |
| PATCH  | `/holidays/:id`          | `holidays.manage`      | `{date?, name?}` |
| DELETE | `/holidays/:id`          | `holidays.manage`      | Remove a holiday |
| GET    | `/lop/summary`           | `leave.approve`        | `month=YYYY-MM` (`userId=` optional): per-employee working, paid leave, unpaid, absent, LOP, present-equivalent, paid days, pending, and LOP dates |
| GET    | `/lop/absences`          | `leave.approve`        | Absences recorded in a month |
| POST   | `/lop/absences`          | `leave.approve`        | `{userId, date, note?}` |
| DELETE | `/lop/absences/:id`      | `leave.approve`        | Remove an absence recorded by mistake |
| GET    | `/allowances`            | `allowances.read`      | Yours, or everyone's with `allowances.manage`. Filters: `month`, `userId`, `status` |
| GET    | `/allowances/summary`    | `allowances.read`      | `month=`: approved and pending totals per employee, approved by type |
| GET    | `/allowances/linkable`   | `allowances.claim` or `allowances.manage` | Recent site visits and installations the allowance can link to (`userId=` needs manage) |
| POST   | `/allowances`            | `allowances.claim` or `allowances.manage` | `{type, amount, date, description, siteVisitId?, installationId?, userId?}` |
| POST   | `/allowances/:id/approve` | `allowances.manage`   | Approve a pending claim |
| POST   | `/allowances/:id/reject` | `allowances.manage`    | `{note}` (required) |
| DELETE | `/allowances/:id`        | `allowances.claim` or `allowances.manage` | Withdraw your pending claim, or remove any entry (manage) |
| GET    | `/hr/employees`          | `leave.approve` or `allowances.manage` | Active employees, for pickers |

Interactive docs: `http://localhost:4000/api/docs`.

## Web pages

| Page | Needs | What it shows |
|------|-------|---------------|
| `/` Dashboard | logged in | Lead counts, pipeline breakdown, follow-ups due today and overdue, recent leads |
| `/leads` | `leads.read` | Filterable lead list. Filters live in the URL, e.g. `/leads?status=QUOTED` |
| `/leads/new` | `leads.write` | Create a lead. The salesperson picker appears only with `leads.assign` |
| `/leads/:id` | `leads.read` | Details, edit, pipeline buttons, follow-ups (schedule and record outcome) |
| `/leads/import` | `leads.write` | Download the template or the 30-lead sample, upload .csv/.xlsx (Meta exports as is), see created, duplicate and failed rows and who got how many |
| `/leads/won` | `leads.read` | Closed/won leads with win date, with date presets / custom range and a count |
| `/follow-ups` | `leads.read` | Overdue, upcoming and completed tabs, with date presets / custom range and a count |
| `/calendar` | `leads.read` | Month calendar of *your* follow-ups. Users with `leads.read_all` can switch to everyone's |
| `/orders` | `sales.read` | Sales orders. Balances and overdue flags appear with `payments.read`. Convert a lead to an order from a won lead's page |
| `/orders/:id` | `sales.read` | Order details, edit, mark delivered (`stock.write`), cancel, payments (`payments.read`/`payments.write`) |
| `/finance/revenue` | `finance.dashboard` or `sales.read` | Revenue by employee (or "My revenue" for sales) with date presets (this month, last month, this financial year, all time) or a custom range |
| `/admin/users` | `users.read` | Users list. With `users.manage`: **New user** and **Edit** (pick a role, which previews the preset's tags), activate or deactivate, reset password. "View tags" needs `permissions.read` |
| `/admin/permissions` | `permissions.read` | Grid of each role's preset tags |
| `/reports` | `reports.view` or `reports.view_all` | Five reports with date presets, each exportable to CSV and Excel; badge shows "Everyone's data" or "Your own data" |
| `/admin/message-templates` | `templates.manage` | WhatsApp templates: create, edit, order, switch off, delete; placeholder list and live preview |
| `/admin/overview` | `finance.dashboard` | Business overview: the former admin dashboard (money, operations, people) |
| `/admin/lead-assignment` | `leads.assign` | A day's leads and their split across the telecallers (Even ✓ check), who is next, and on/off switches for both rotations (telecallers; salespeople receiving qualified leads). "Their leads →" opens the leads list filtered to that person |
| `/admin/api-keys` | `apikeys.manage` | Generate (shown once, with a copy button), list and revoke API keys. API docs with a curl example, and Meta webhook status |
| `/finance/overdue` | `payments.read` | Balance overdue: orders with money owed past the due date, days overdue, sortable |
| `/vendors` | `vendors.read` | Vendor outstanding: what we owe each vendor, with overdue flagged |
| `/vendors/:id` | `vendors.read` | Purchases (unpaid and overdue per bill), payments, and forms to add both |
| `/stock` | `stock.read` | Product cards with low-stock flags, add production or adjust, alert levels, movement log |
| `/installations` | `installations.read` | Month calendar (late in red, done struck through) or a list filterable by status. "Schedule installation" needs `installations.write` |
| `/installations/:id` | `installations.read` | Details, start, complete, reschedule. "Raise service job" appears after completion, with `service.write` |
| `/service` | `service.read` | Service jobs with status, type and priority filters. Rows with an overdue follow-up are red |
| `/service/:id` | `service.read` | Job details, update (`service.write`), and its service follow-ups |
| `/service/follow-ups` | `service.read` | Overdue, upcoming and completed service follow-ups |
| `/site-visits` | `sitevisit.read` | Visits with tag filter chips. "Record visit" needs `sitevisit.write` |
| `/site-visits/:id` | `sitevisit.read` | Visit details and edit |
| `/site-visits/tags` | `sitevisit.manage_tags` | Manage the tag list: add, edit, retire or restore, delete if unused |
| `/leave` | `leave.apply` | My leave: balance cards, this month's LOP, apply, history with withdraw |
| `/leave/calendar` | `leave.read` | Month calendar of holidays (amber) and who is on leave. Click a day for details |
| `/holidays` | `leave.read` | Holiday list by year. Add, edit and remove need `holidays.manage` |
| `/allowances` | `allowances.read` | Month picker, totals (per employee for managers), entries, claim or add form, approve or reject |
| `/leave/approvals` | `leave.approve` | Pending first. Approve, or reject with a reason |
| `/hr/lop` | `leave.approve` | Monthly LOP table (click an LOP number to see its dates), "How this is calculated", and record an absence |

### Role dashboards

The landing page (`/`) is designed around the user's **role** (`web/src/components/dashboards/`). Each dashboard only requests data its tags allow, and checks them again, so a user with extra or missing tags just sees more or fewer cards and never a permission error.

| Role | Dashboard |
|------|-----------|
| **admin** | **Master dashboard.** Team numbers for today (leads in, calls logged, new leads not called, overdue callbacks and follow-ups, qualified today, won and revenue this month). **Needs attention**: who is slipping, worst first (uncalled new leads with how long the oldest has waited, overdue callbacks, overdue sales follow-ups, open deals with no follow-up planned). Today's leads by telecaller with an Even ✓ check. **Telecaller scorecard** (leads today, active, not called yet, overdue callbacks, calls today and this week, qualified this month, conversion = share of this month's leads qualified) and **sales scorecard** (qualified received this month, open pipeline, won, revenue, follow-ups overdue, no follow-up planned, follow-up compliance = share of this month's due follow-ups done). OpenStreetMap of sales site check-ins from the last 30 days. The old executive view (money, operations, people) is at **Admin → Business overview** |
| **sales** | Only the leads handed to them. KPIs: revenue and won this month, open pipeline, follow-ups overdue. **Follow-ups overdue and due today** (all in red), each with tap-to-call and Log call. **Pipeline board**: Qualified → Quoted → Won this month → Lost this month, with counts; each card shows who qualified it and the next follow-up. **Site visits**: "I'm at site" GPS check-in, recent visits with coordinates, and an OpenStreetMap of them |
| **telecaller** | **Workbench.** KPIs: my new leads today, callbacks due today, my overdue callbacks (red), calls logged today. The worklist of their New/Contacted leads in call order: overdue callbacks → due today → new (never called) → called but no callback set → later. Each lead: tap-to-call, WhatsApp, status, last call and next callback, and **Log call**, **Set/Change callback**, **Qualify**. **No money anywhere** |
| **factory_supervisor** | Stock, Installations, Service jobs, Service follow-ups, Site visits, own leave and allowances. No CRM or finance | `stock.read` `stock.write` `installations.read` `installations.write` `service.read` `service.read_all` `service.write` `sitevisit.read` `sitevisit.write` + own leave and allowances |

- **Own leave and allowances** means `leave.apply`, `leave.read` (team calendar and holidays), `allowances.read` and `allowances.claim`.
- **"Own" scoping:** sales see only their own leads and orders because they have `leads.read` and `sales.read` without the matching `*_read_all` tag.
- **Revenue (own):** the Revenue page shows a salesperson only their own row. Admins with `finance.dashboard` still see every salesperson.
- **Service for supervisors:** supervisors get `service.read_all` because they run the service team.
- **Sales and service:** service jobs aren't in the sales preset.
- **Per-user overrides:** `PUT /users/:id/permissions` still exists for exceptions, and "View tags" on the Users screen shows anyone's effective tags.

The seed also adds 10 sample leads. Suresh has 5, Priya has 4, and 1 is unassigned. They cover every source, product and status. There are 14 follow-ups, dated relative to the day you seed, so some are always overdue, some due today and some upcoming. The seed adds sample leads only when the leads table is empty. Run `npm run db:reset` to start over.

The finance and stock seed adds the following. Dates are relative to the day you seed.

- **Stock:**
  - Sump 3,000 L: 6 (alert at 3)
  - Sump 4,000 L: 5 (alert at 3)
  - **Sump 5,000 L: 2 (alert at 3), low**
  - Sump 6,000 L: 4 (alert at 2)
  - Sump 8,000 L: 3 (alert at 2)
  - Sump 10,000 L: 7 (alert at 3)
  - **Sump 12,000 L: 2 (alert at 2), low**
  - Sump 15,000 L: 3 (alert at 1)
  - Sump 20,000 L: 2 (alert at 1)
  - Microbes: 40 packs (alert at 25)
- **4 sales orders from won leads:**
  - SO-0001 Senthil Farms (Suresh): 20 packs of microbes. ₹8,000 of ₹18,000 **overdue**
  - SO-0002 Divya Hospital (Priya): 2 × Sump 20,000 L. ₹2,20,000 of ₹4,20,000 **overdue**
  - SO-0003 Sri Murugan Residency (Suresh): 1 × Sump 5,000 L. ₹45,000 due in 10 days, not yet delivered
  - SO-0004 Kongu Engineering College (Priya): 1 × Sump 15,000 L, fully paid
- **2 won leads with no order yet**, for trying the conversion: Sakthi Hardware Stores (Suresh, microbes) and Palani Hill Resorts (Priya, Sump 10,000 L).
- **3 vendors:**
  - Ramco Cement: ₹1,30,000 owed, ₹50,000 of it **overdue**
  - Sri Balaji Steels: ₹1,40,000 owed, not yet due
  - KPN Transports: settled

Each part of the seed is skipped if its table already has data.

The service seed adds the following.

- **4 installations:**
  - Completed: Divya Hospital, Kongu Engineering College and Senthil Farms.
  - Sri Murugan Residency, **scheduled in 3 days**. Its order isn't delivered yet, so completing the installation will deliver it.
- **5 service jobs** on the completed installations:
  - SJ-0001 Divya complaint: high priority, in progress, with an **overdue** follow-up.
  - SJ-0002 Divya pre-monsoon cleaning: urgent, open, unassigned.
  - SJ-0003 Kongu warranty: resolved.
  - SJ-0004 Kongu annual check: open, with an **overdue** follow-up.
  - SJ-0005 Senthil Farms microbe check: open.
- **5 site-visit tags:** survey, measurement, complaint-visit, installation-check and soil-test.
- **4 site visits** that use the tags.

The HR seed adds the following.

- **12 company holidays for 2026.** This is a *sample* Tamil Nadu list; check it against the official one.
- **9 leave applications** covering every status:
  - Suresh: approved casual (last month), approved sick (this month), and pending casual (next week).
  - Priya: approved **unpaid** (2 days, LOP) and a rejected casual request with a reason.
  - Tara: pending casual.
  - Farid: approved casual coming up, and a cancelled sick request.
  - Ravi: approved **unpaid** (1 day, LOP).
- **2 absences without approval**, for Tara and Ravi. In October: Priya has 2 LOP days, Ravi 2 and Tara 1.
- **9 allowance entries:**
  - Approved, pending and rejected ones.
  - Some linked to Ravi's and Farid's site visits or installations.
  - One of Priya's is from last month.

## How access control works

- Each user has one **role**. Each role has default **permission tags**, e.g. `users.read`.
- Admin can **grant** extra tags to a single user or **revoke** tags from them. Effective tags = role tags + granted tags − revoked tags.
- Each tag belongs to a **module**. A user's visible modules are the modules of their tags.
- Every route must declare exactly one policy. A route with no policy is refused (deny by default).
  - `@Public()`: no login needed
  - `@AuthenticatedOnly()`: any logged-in active user
  - `@RequirePermissions('tag', ...)`: needs all the listed tags. Checks tags, never role names.
  - `@RequireAnyPermission('tag', ...)`: needs at least one of the listed tags (e.g. an employee picker used by both approvers and allowance managers).
- Tags are read from the DB on every request, so admin changes take effect immediately.
- Logout revokes the token's `jti`. That token is rejected from then on.
- The tag catalog lives in `api/src/access-control/permission-catalog.ts`. To add a module, add its tags there, re-run the seed, and decorate its endpoints.
- The web UI hides nav items and buttons the user lacks tags for. That's only for convenience. The API enforces every rule.

### CRM tags (Phase 2)

| Tag | Allows |
|-----|--------|
| `leads.read` | See leads assigned to you, their follow-ups, the won list and the calendar |
| `leads.read_all` | Widens `leads.read` to every lead, including unassigned ones |
| `leads.write` | Create leads and edit leads you can see (details, notes, pipeline status) |
| `leads.qualify` | Telecaller preset. Update leads **assigned to you** after a call: name, email, city, product, size, notes and pipeline status. Phone and source stay locked (the phone is what duplicate checks match on); no creating, importing or reassigning |
| `leads.assign` | Choose or change who a lead is assigned to; see Admin → Lead assignment and switch telecallers in or out of the rotation |
| `leads.auto_assign` | Puts the holder in the round-robin for incoming leads (telecaller preset). Not given to admin: admin manages the rotation, it doesn't receive leads |
| `followups.write` | Schedule, reschedule and complete follow-ups on leads you can see |

- Admin sees all leads because they hold `leads.read_all`, not because of their role name.
- A salesperson's lead is auto-assigned to them, and they can't reassign it.
- A lead outside your scope returns 404, not 403, so its ID can't be probed.

### Finance and stock tags (Phase 3)

| Tag | Allows |
|-----|--------|
| `sales.read` | See sales orders credited to you |
| `sales.read_all` | Widens `sales.read` to every order |
| `sales.write` | Convert won leads into orders; edit or cancel orders you can see |
| `payments.read` | See amounts received, balances, and the company-wide balance-overdue list |
| `payments.write` | Record or remove customer payments |
| `vendors.read` / `vendors.write` | View / manage vendors, purchases and vendor payments |
| `stock.read` / `stock.write` | View stock / add production, adjust, set alert levels, **and mark orders delivered** |
| `finance.dashboard` | Revenue for every salesperson and the company-wide finance card. Without it, `sales.read` holders see only their own revenue |

- Admin holds all of these.
- Salespeople hold only `sales.read` and `sales.write`, scoped to their own orders. They don't see payment or balance fields. The API leaves those fields out unless the user holds `payments.read`.
- The factory supervisor holds the stock tags (see **Role presets** above for every role).
- Marking an order delivered needs `sales.read` plus `stock.write`. So by default only admin can deliver. To let the supervisor deliver, an admin grants them `sales.read` and `sales.read_all`.

### Service and installation tags (Phase 5)

| Tag | Allows |
|-----|--------|
| `installations.read` | See the installation schedule (calendar and list) and installation details |
| `installations.write` | Schedule, reassign, reschedule, start and complete installations |
| `service.read` | See service jobs for **customers you sold to** (you're the order's salesperson) **or jobs assigned to you** |
| `service.read_all` | Widens `service.read` to every job |
| `service.write` | Raise service jobs, update them, and schedule or complete their follow-ups (on jobs you can see) |
| `sitevisit.read` / `sitevisit.write` | View / record and edit site visits and choose their tags |
| `sitevisit.manage_tags` | Add, rename, recolour, retire or delete site-visit tags |

- Admin holds all of these.
- The factory supervisor holds the installation, service (all jobs) and site-visit tags.
- Salespeople hold the site-visit tags but no service tags. Grant `service.read` to an individual if they need to see their customers' jobs.

### HR tags

| Tag | Allows |
|-----|--------|
| `leave.apply` | Apply for and withdraw your own leave; see your own history, balance and monthly LOP |
| `leave.read` | Team calendar (holidays and who is on approved leave) and the holiday list |
| `leave.approve` | See every application, approve or reject (never your own), record absences without approval, and see everyone's LOP summary |
| `holidays.manage` | Add, edit and remove company holidays |
| `allowances.read` | See your own allowances and monthly total |
| `allowances.claim` | Submit your own allowance claims (pending until approved) |
| `allowances.manage` | See everyone's allowances, add for anyone (approved immediately), and approve or reject claims |

- Every employee gets `leave.apply`, `leave.read`, `allowances.read` and `allowances.claim`.
- Admin gets all the HR tags.
- The leave type is hidden on the team calendar except from approvers and the person themselves, so sick leave stays private.

## HR rules (leave, holidays, LOP, allowances)

The rules live in `api/src/hr/hr-config.ts` and `api/src/hr/lop.service.ts`. They are deliberately simple: the output feeds payroll later, but this is not payroll.

- **Working days:** every day except the weekly off and company holidays.
  - The weekly off defaults to Sunday. Change it with `WEEKLY_OFF_DAYS`, e.g. `0,6` for a 5-day week.
  - Leave and LOP **day counts are always computed from the dates**, never stored, so editing a holiday updates every number.
- **Leave:** the types are casual, sick and unpaid. Status runs `PENDING → APPROVED` or `REJECTED`, and the employee can `CANCEL` (withdraw) it.
  - Paid leave per calendar year: **12 casual and 6 sick**. Unused days don't carry over, and there's no pro-rating for joining date.
  - Applying for casual or sick leave is refused if it exceeds what's left after approved and pending leave. The error suggests applying the extra days as unpaid.
  - A date range that's all holidays or weekly offs is refused, as is one that overlaps your own pending or approved leave.
  - One application covers at most 60 calendar days.
  - Withdrawing works while pending, or while approved but not yet started.
  - Approvers can't decide their own leave, and rejecting needs a reason.
- **LOP, per employee per month (working days only):**
  - **Paid leave** = approved casual and sick days.
  - **LOP** = approved **unpaid** leave days + **absences without approval**. An absence is a working day an approver recorded as away without approved leave. It's only counted if no approved leave covers that day.
  - **Present-equivalent** = working days − paid leave − LOP. These are days assumed worked, since there's no attendance data yet.
  - **Paid days** = working days − LOP. This is what payroll will use.
  - Pending leave counts as neither. It's reported separately so it can be decided before the month closes.
  - Rejected or cancelled leave counts as nothing. If the person stayed away anyway, record an absence.
  - Absences can only be recorded for today or earlier, on a working day, once per person per day. When GPS attendance arrives with the mobile app, it can create these automatically.
- **Allowances:** the types are travel, food, site and other. Each records an amount, a date (not in the future), a description, and optionally a linked site visit or installation. Without `allowances.manage`, you can only link your own visits or installations assigned to you.
  - Employee claims start **pending**. Entries added by an `allowances.manage` holder are **approved** immediately.
  - Rejecting needs a reason. Employees can withdraw their own pending claims.
  - The monthly total counts **approved** entries only. Pending amounts are shown separately.

## Service and installation rules

- **Installations:** one per sales order. Any order that isn't cancelled can be scheduled. The flow is `SCHEDULED → IN_PROGRESS → COMPLETED`, and "start" can be skipped. Completed installations are locked.
  - An installation past its date and not yet completed is flagged **late**.
  - **Completing an installation is what makes the customer eligible for service jobs.**
  - If the order wasn't delivered yet, completing also delivers it and reduces stock in the same transaction. That needs `stock.write`.
- **Service jobs:**
  - A job can only be raised against a **completed** installation. With `service.read_all` that's any customer; otherwise only customers you sold to.
  - Types are complaint, maintenance and warranty. Priority runs low → urgent. Status runs `OPEN → IN_PROGRESS → RESOLVED`. Resolving records the time, and reopening clears it.
  - The assignee must hold `service.write`.
- **Service follow-ups:** work like sales follow-ups. Each is pending until an outcome is recorded, and it's overdue once its time passes. Overdue ones are shown in red.
- **Site visits:**
  - Each records a date, the person who visited (anyone active), customer or site, address, purpose, and optionally the installation it's about.
  - Tags come from the admin-managed list. A **retired** tag is hidden from new visits but stays on old ones. A tag that's in use can't be deleted, only retired.

## Finance and stock rules

- **Stock items:** every sump size is a separate stock item (SKU `SUMP-3000` … `SUMP-20000`), and microbes is `MICROBES`. The valid sizes are defined in `api/src/stock/product-catalog.ts`. An order points at exactly one stock item, so delivering it reduces that size's count. The Stock screen groups all sump sizes under **Sump**, and Microbes is shown separately.
- **Choosing a product:**
  - When converting a won lead, pick **Sump + size** or **Microbes**.
  - The size defaults to the lead's size. A sump order without a valid size is refused, and so is a size on a microbes order.
  - On a lead, the sump size is optional ("Not decided yet"), and switching a lead to microbes clears it.

- **Money:** stored as Decimal(12,2) rupees and sent over the API as strings ("125000.00"). Business dates (order, due, paid on) are plain dates in `YYYY-MM-DD`. "Today" uses `BUSINESS_TIMEZONE` (default `Asia/Kolkata`).
- **Sales orders:**
  - Only a `WON` lead can be converted, with one order per lead.
  - Revenue goes to the lead's salesperson. Crediting someone else needs `sales.read_all`.
  - The payment due date defaults to the order date + 30 days.
  - A lead with an active order can't be moved out of `WON`. Cancel the order first.
- **Balance due** = total − payments.
  - Overpayment is refused.
  - An order is **overdue** when a balance remains after its due date.
  - A cancelled order owes nothing. Only undelivered orders with no payments can be cancelled.
  - The total can't be lowered below what's already been received.
- **Delivery:** marking an order delivered reduces stock in the same transaction and logs a stock movement. It's refused if stock is short, so stock never goes negative. Product and quantity are locked after delivery.
- **Vendor outstanding** = purchases − payments to that vendor.
  - Payments are applied to the oldest bills first. That shows how much of each bill is unpaid, and the overdue amount is the unpaid part of bills past their pay-by date.
  - Paying more than is owed is refused.
- **Revenue by employee:** order value per salesperson, by order date, excluding cancelled orders. It also shows how much has been collected and how much is still outstanding.

## CRM rules

- **Pipeline:** `NEW → CONTACTED → QUALIFIED → QUOTED → WON`, or `LOST` from any stage. Any status can be set. Entering `WON` or `LOST` sets `closedAt`, and reopening clears it.
- **Follow-ups:** each one is *pending* until an outcome is recorded (connected, no answer, call back, interested, not interested, quote sent, other). It's *overdue* when pending and its time has passed. A completion can be reopened if it was recorded by mistake.
- **Phone numbers:** stored normalized. `98765 43210` becomes `9876543210`.
- **Duplicates from outside:** import, the public API and the Meta webhook never create a second lead for the same phone. Phones match on their **last 10 digits**, so `+919876543210`, `919876543210` and `9876543210` are the same customer. The lead's detail page shows where it came from, for example "Import: march.xlsx", "API key: Website form" or "Meta lead form 123".

## Getting leads in: import, public API, Meta webhook

All three go through one intake service (`api/src/intake/`), so validation, duplicate handling and **round-robin assignment** are the same everywhere.

### Round-robin assignment to telecallers

The business gets 50-60 leads a day from Meta click-to-WhatsApp ads, with name and phone only, shared across 3 telecallers.

- **Who is in the rotation:** active users holding `leads.auto_assign` (the telecaller preset) whom the admin has left **switched on** under Admin → Lead assignment. Switch someone off for leave, and they're skipped until switched back on.
- **Rule:** every new lead from an import, the API or Meta **without a chosen person** goes to the member who has waited longest since their last round-robin lead. With A, B and C that gives A, B, C, A, B, C… within one upload, across uploads and API calls, and through the day. Someone newly added, or switched back on after missing turns, is next.
- **Fair under load:** the pick and the new lead are saved in one database transaction behind a lock, so two leads arriving at the same moment never get the same turn. A duplicate (phone already a lead) is skipped and uses no turn.
- **Not in the rotation:** leads typed in by hand on "New lead" follow the old rule, and import rows that name a salesperson go to that person.
- **Manual change:** admin opens a lead and changes "Assigned to". The lead is then no longer counted as round-robin (`autoAssigned` cleared).
- **No one switched on:** leads arrive unassigned, and the import result and the Lead assignment page say so.
- **Admin view:** Admin → Lead assignment (`leads.assign`) shows a day's leads (today by default), how many came by round-robin, how many are unassigned, and each telecaller's count with an "Even ✓" check. It also shows who is next and each person's on/off switch.

### 1. Bulk import (Leads → Import)

- **Who:** anyone with `leads.write` (admin, sales). Telecallers don't have it.
- **Meta exports work as they are:** only `name` and `phone` are required, and Meta's `full_name` / `phone_number` headings, its `p:+91…` phone values and its UTF‑16 tab-separated CSV download are understood. Other Meta columns (id, ad name…) are ignored and listed. Pick **"Source for rows without one"** (Meta by default) on the import screen.
- **Sample file:** `web/public/samples/meta-leads-sample.csv` (also linked on the import screen). It has 30 name + phone rows; 2 phones already exist in the demo data and 1 is repeated, so on fresh demo data it gives **27 created, 3 skipped, 9 / 9 / 9**.
- **Template:** `.xlsx` (with dropdowns and a "How to fill" sheet) or `.csv`. Columns: `name`*, `phone`*, `city`, `product` (Sump or Microbes; blank = not known yet, and a size on its own means Sump), `sump size` (3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000 or 20000; "10,000 L" also works), `source` (Meta, Manual, Website, Referral, Other; blank uses the import screen's choice), `assigned salesperson` (email or full name), `notes`. Header names are matched loosely ("Mobile", "Sump Size (litres)" and so on); unknown columns are ignored and listed.
- **Assigning:** a blank salesperson means **round-robin** to the telecallers. With `leads.assign` (admin) you can name anyone. Without it (sales) you can only name yourself, to keep a row; naming someone else fails that row.
- **Result:** counts of created, skipped as duplicates (phone already a lead, or repeated earlier in the same file), and failed rows with their row number and reasons. It also shows **who got how many** of the new leads, and who each created lead went to. Valid rows are imported even when other rows fail.
- **Nothing is imported** when the file isn't a readable `.csv`/`.xlsx` (old `.xls` gets a "Save As .xlsx" hint), when the `name` or `phone` heading is missing, when there are no rows, when it's over 2 MB, or when it has over 2,000 rows. The template's "Example - …" rows are refused.

### 2. Public create-lead API (requirement #21)

- **Keys:** Admin → API keys (`apikeys.manage`, admin only). Generate a key, which is shown **once**. Only its SHA-256 hash and first characters are stored. Revoking takes effect immediately, and "last used" is recorded.
- **Endpoint:** `POST http://<server>:4000/api/v1/public/leads`, or through the web app at `http://<server>:3000/api/v1/public/leads`.
- **Headers:** `Content-Type: application/json` and `X-API-Key: precon_…`.
- **Body:** `name`*, `phone`*, `product` (`SUMP`|`MICROBES`; leave it out if not known), `sumpSizeLitres`, `city`, `email`, `notes`, `source` (`API` default, `WEBSITE`, `REFERRAL`, `OTHER`), `externalId` (your id; resending it counts as a duplicate).
- **Responses:**
  - `201 {"status":"created","leadId","assignedTo"}`: `assignedTo` is the telecaller the round-robin picked
  - `200 {"status":"duplicate","reason":"phone"|"externalId","leadId"}`: nothing is created.
  - `400`: validation errors, listed.
  - `401`: missing, wrong or revoked key.
  - `429`: rate limited, with a `Retry-After` header.
- **Rate limit:** `PUBLIC_API_RATE_LIMIT` per key per minute (default 60).
- **Owner:** new API leads go round-robin to the telecallers. They are recorded as created by the admin who made the key.

```bash
curl -X POST http://localhost:4000/api/v1/public/leads \
  -H "Content-Type: application/json" \
  -H "X-API-Key: precon_devsample_website_7f3c9a1e5b2d4f60" \
  -d '{"name":"Ravi Kumar","phone":"+91 98765 43210","product":"SUMP","sumpSizeLitres":10000,"city":"Coimbatore","externalId":"form-0042"}'
```

**Dev sample keys:** seeded only outside production, and only when no keys exist. These values are public, so never use them for real.

| Key | State |
|-----|-------|
| `precon_devsample_website_7f3c9a1e5b2d4f60` | active ("Website contact form (dev sample)") |
| `precon_devsample_revoked_2b8e6d4a9c1f3e70` | revoked, so it gets a 401 |

### 3. Meta (Facebook) Lead Ads webhook (receiving end)

- `GET /api/v1/webhooks/meta`: Meta's subscription check. It replies with `hub.challenge` as plain text when `hub.mode=subscribe` and `hub.verify_token` equals `META_VERIFY_TOKEN`. A wrong token gets 403, and 503 means the token isn't configured.
- `POST /api/v1/webhooks/meta`: "leadgen" notifications.
  1. The `X-Hub-Signature-256` header is checked against `META_APP_SECRET`.
  2. Meta sends only a lead id, so the answers are fetched from the Graph API with `META_PAGE_ACCESS_TOKEN`.
  3. The lead is created with source **Meta**. Duplicates are skipped by leadgen id or phone.
  4. Form fields used: `full_name`, `phone_number`, `email`, `city`, plus optional custom questions `product` and `sump_size`. A lead without them has product "not known yet", and it goes round-robin to a telecaller. Any other answers go into notes. The product defaults to Sump.
  5. Errors for a single lead are logged and reported in the response; they never crash the API.
- With the settings missing, both endpoints answer **503 "not configured"**, and the rest of the API keeps working. Admin → API keys shows which settings are present, never their values.
- **Dev test without Meta:** `npm run meta:test-webhook` (in `/api`) signs a fake notification with your local `META_APP_SECRET` and posts it. The answers are sent inline, which the API accepts **only when `NODE_ENV` isn't `production`**. Add a phone, e.g. `npm run meta:test-webhook -- 9876543210`, to see a duplicate.

**Environment variables (`api/.env`):**

| Variable | What it is |
|----------|------------|
| `META_VERIFY_TOKEN` | Any random string you make up. Enter the same one in the Meta app's webhook setup |
| `META_APP_SECRET` | Meta app → App settings → Basic → App secret. Verifies that requests really come from Meta |
| `META_PAGE_ACCESS_TOKEN` | A long-lived **Page** access token with `leads_retrieval`, used to fetch each lead's answers |
| `META_GRAPH_API_VERSION` | Graph API version, default `v23.0`. Check Meta's current version |
| `PUBLIC_API_RATE_LIMIT` | Public API requests per key per minute (default 60) |

**Manual setup on Meta's side (required to activate it):**
1. **Public HTTPS URL:** Meta must reach `https://<your-domain>/api/v1/webhooks/meta`. A LAN address (192.168.x.x) won't work. This needs hosting or a tunnel, which isn't set up yet.
2. **Meta app:** create one (type Business) at developers.facebook.com, connected to the company's Business Manager.
3. **Webhooks product:** add it to the app → choose **Page** → subscribe to the **`leadgen`** field. Enter the callback URL and your `META_VERIFY_TOKEN`; Meta calls the GET endpoint to verify.
4. **Permissions:** `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`. Using them with real customers needs **App Review** and **Business Verification**.
5. **Page access token:** get a long-lived one (ideally from a system user in Business Manager) and put it in `META_PAGE_ACCESS_TOKEN`. Copy the App secret into `META_APP_SECRET`.
6. **Subscribe the Page to the app:** `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` with the page token.
7. **Lead access:** in Business Manager → Integrations → Leads Access, give the app (or CRM) access to the page's leads.
8. **Test:** use Meta's Lead Ads Testing Tool (developers.facebook.com/tools/lead-ads-testing) and check that the lead appears with source Meta.

## API endpoints (prefix `/api/v1`)

| Method | Path                     | Access                 | Purpose |
|--------|--------------------------|------------------------|---------|
| GET    | `/health`                | public                 | API + DB up check |
| POST   | `/auth/login`            | public                 | `{email, password}` → `{accessToken, expiresAt, user}` |
| POST   | `/auth/logout`           | logged in              | Revokes the current token (204) |
| GET    | `/auth/me`               | logged in              | Current user, role, effective tags, modules |
| GET    | `/users`                 | `users.read`           | List users, with role and `customTagCount` |
| POST   | `/users`                 | `users.manage`         | Create: `{fullName, email, roleKey, password, phone?}`. Tags come from the role preset |
| PATCH  | `/users/:id`             | `users.manage`         | `{fullName?, phone?, roleKey?, isActive?, password?}`. Changing `roleKey` resets tags to that preset. You can't change your own role or deactivate yourself |
| GET    | `/users/:id/permissions` | `permissions.read`     | Role tags, overrides, effective tags |
| PUT    | `/users/:id/permissions` | `permissions.assign`   | Replace overrides: `{grant: [...], revoke: [...]}`. You can't change your own. |
| GET    | `/roles`                 | `permissions.read`     | Roles with default tags and user counts |
| GET    | `/permissions`           | `permissions.read`     | Full tag catalog |
| GET    | `/leads`                 | `leads.read`           | List leads in your scope. Filters: `status`, `source`, `productInterest`, `assignedToId`, `search` (name/phone/city), `page`, `pageSize`. `status=WON` = closed/won view, newest win first |
| GET    | `/leads/summary`         | `leads.read`           | Dashboard counts: leads by status, open leads, overdue and upcoming follow-ups |
| GET    | `/leads/assignees`       | `leads.assign`         | Active users who hold `leads.read` (assign dropdown) |
| GET    | `/leads/:id`             | `leads.read`           | One lead with all its follow-ups |
| POST   | `/leads`                 | `leads.write`          | Create: `{name, phone, source, productInterest? (SUMP|MICROBES, null = not known yet), sumpSizeLitres?, email?, city?, status?, notes?, assignedToId?}`. `assignedToId` for someone else needs `leads.assign` |
| PATCH  | `/leads/:id`             | `leads.write` or `leads.qualify` | Edit any field or move it in the pipeline. Changing `assignedToId` needs `leads.assign`. With only `leads.qualify`: your own leads only, and changing `phone` or `source` gets 403 |
| GET    | `/leads/import/template` | `leads.write`          | `format=xlsx` (default) or `csv`: import template download |
| POST   | `/leads/import`          | `leads.write`          | Multipart `file` (.csv/.xlsx), optional `defaultSource` → `{totalRows, created, createdRows[{…, assignedTo}], duplicates[], failed[{row, errors}], ignoredColumns, assignments[{fullName, count}], autoAssigned, unassigned}`. 400 and nothing imported for a bad file |
| GET    | `/lead-assignment`       | `leads.assign`         | `date=YYYY-MM-DD` (default today): `{total, autoAssigned, unassigned, spread, nextUp, members[{fullName, autoAssignEnabled, leads, autoAssignedLeads, lastAutoAssignedAt}], others[]}` |
| PATCH  | `/lead-assignment/members/:userId` | `leads.assign` | `{enabled}`: switch a telecaller in or out of the round-robin (they must hold `leads.auto_assign`) |
| GET    | `/api-keys`              | `apikeys.manage`       | Keys with prefix, status, last used (never the key or hash) |
| POST   | `/api-keys`              | `apikeys.manage`       | `{name}` → key details plus `key`, the full key, returned only this once |
| POST   | `/api-keys/:id/revoke`   | `apikeys.manage`       | Revoke a key |
| GET    | `/api-keys/meta-status`  | `apikeys.manage`       | Which Meta env vars are set (true/false only) |
| POST   | `/public/leads`          | **API key** (`X-API-Key`) | Create a lead from an external system. See "Getting leads in" |
| GET    | `/webhooks/meta`         | public (verify token)  | Meta webhook verification (`hub.challenge`) |
| POST   | `/webhooks/meta`         | public (Meta signature) | Meta Lead Ads `leadgen` notifications |
| GET    | `/follow-ups`            | `leads.read`           | Follow-ups in your scope. `state=pending\|overdue\|upcoming\|completed`, `from`/`to` (ISO, for the calendar), `assignedTo=me` |
| POST   | `/leads/:leadId/follow-ups` | `followups.write`   | Schedule: `{scheduledAt, note?}` |
| PATCH  | `/follow-ups/:id`        | `followups.write`      | Reschedule or edit the note |
| POST   | `/follow-ups/:id/complete` | `followups.write`    | Record the outcome: `{outcome, note?}` |
| POST   | `/follow-ups/:id/reopen` | `followups.write`      | Undo a completion |
| GET    | `/sales-orders`          | `sales.read`           | Orders in your scope. Filters: `status`, `from`/`to` (order date), `salespersonId`, `page`, `pageSize`. Includes `amountPaid`/`balanceDue`/`isOverdue` only with `payments.read` |
| GET    | `/sales-orders/summary`  | `sales.read`           | Your orders and value this month, and orders awaiting delivery |
| GET    | `/sales-orders/:id`      | `sales.read`           | One order; its payments are included with `payments.read` |
| POST   | `/sales-orders`          | `sales.write` + `leads.read` | Convert a WON lead: `{leadId, quantity, totalAmount, product? (SUMP|MICROBES), sizeLitres? (required for a sump unless the lead has one), orderDate?, dueDate?, notes?, salespersonId?}` |
| PATCH  | `/sales-orders/:id`      | `sales.write`          | Edit total, dates, notes, salesperson. Product, `sizeLitres` and quantity only before delivery |
| POST   | `/sales-orders/:id/deliver` | `sales.read` + `stock.write` | Mark delivered and reduce stock |
| POST   | `/sales-orders/:id/cancel` | `sales.write`        | Cancel an undelivered order with no payments |
| POST   | `/sales-orders/:id/payments` | `sales.read` + `payments.write` | Record a payment: `{amount, paidOn, mode, reference?, note?}` |
| DELETE | `/payments/:id`          | `sales.read` + `payments.write` | Remove a payment recorded by mistake |
| GET    | `/finance/summary`       | `finance.dashboard`    | Revenue this month, receivable, overdue receivable, payable, overdue payable |
| GET    | `/finance/revenue-by-employee` | `finance.dashboard` or `sales.read` | `from`/`to` (order date). Per salesperson: orders, revenue, collected, outstanding. Without `finance.dashboard` you get only your own row (`scope: "own"`) |
| GET    | `/finance/overdue-balances` | `payments.read`     | Orders with a balance past due, company-wide. `sort=oldest\|largest` |
| GET    | `/vendors`               | `vendors.read`         | Vendors with purchased, paid, outstanding, overdue, oldest unpaid due |
| GET    | `/vendors/:id`           | `vendors.read`         | Vendor with each purchase's unpaid and overdue amount, and its payments |
| POST   | `/vendors`               | `vendors.write`        | `{name, category, contactPerson?, phone?, email?, notes?}` |
| PATCH  | `/vendors/:id`           | `vendors.write`        | Edit a vendor |
| POST   | `/vendors/:id/purchases` | `vendors.write`        | `{item, amount, purchaseDate, dueDate, invoiceNumber?, notes?}` |
| POST   | `/vendors/:id/payments`  | `vendors.write`        | `{amount, paidOn, mode, reference?, note?}` |
| DELETE | `/vendor-payments/:id`   | `vendors.write`        | Remove a vendor payment recorded by mistake |
| GET    | `/stock`                 | `stock.read`           | Stock items (`sku`, `code`, `sizeLitres`, name, quantity on hand, alert level, `isLow`): sumps smallest to largest, then microbes |
| GET    | `/stock/movements`       | `stock.read`           | Latest 50 movements (`productId` optional) |
| POST   | `/stock/:productId/movements` | `stock.write`     | `{change, reason: PRODUCTION\|ADJUSTMENT, note?}`. Refused if it would go below 0 |
| PATCH  | `/stock/:productId`      | `stock.write`          | `{lowStockThreshold?, name?, unit?}` |
| GET    | `/installations`         | `installations.read`   | Schedule. Filters: `status`, `from`/`to` (date), `assignedTo=me`. Includes `isLate` |
| GET    | `/installations/summary` | `installations.read`   | Scheduled in the next 7 days, in progress, late, completed |
| GET    | `/installations/eligible-orders` | `installations.write` | Orders that can be scheduled |
| GET    | `/installations/assignees` | `installations.write` | People who can lead an installation |
| GET    | `/installations/:id`     | `installations.read`   | One installation with its service jobs |
| POST   | `/installations`         | `installations.write`  | `{salesOrderId, scheduledDate, siteAddress, assignedToId?, teamName?, notes?}` |
| PATCH  | `/installations/:id`     | `installations.write`  | Reschedule, reassign or edit (not once completed) |
| POST   | `/installations/:id/start` | `installations.write` | SCHEDULED → IN_PROGRESS |
| POST   | `/installations/:id/complete` | `installations.write` (+ `stock.write` if the order isn't delivered) | → COMPLETED: `{completionNotes?}` |
| GET    | `/service-jobs`          | `service.read`         | Jobs in your scope, unresolved and urgent first. Filters: `status`, `type`, `priority`, `assignedTo=me` |
| GET    | `/service-jobs/summary`  | `service.read`         | Open, in progress, urgent/high, overdue and upcoming service follow-ups |
| GET    | `/service-jobs/eligible-installations` | `service.write` | Completed installations you can raise jobs against |
| GET    | `/service-jobs/assignees` | `service.write`       | People who can be assigned service work |
| GET    | `/service-jobs/:id`      | `service.read`         | One job with its follow-ups |
| POST   | `/service-jobs`          | `service.write`        | `{installationId, type, description, priority?, assignedToId?}` |
| PATCH  | `/service-jobs/:id`      | `service.write`        | `{type?, priority?, status?, description?, assignedToId?, resolutionNotes?}` |
| GET    | `/service-follow-ups`    | `service.read`         | `state=pending\|overdue\|upcoming\|completed`, `from`/`to`, `assignedTo=me` |
| POST   | `/service-jobs/:id/follow-ups` | `service.write`  | `{scheduledAt, note?}` |
| PATCH  | `/service-follow-ups/:id` | `service.write`       | Reschedule or edit the note |
| POST   | `/service-follow-ups/:id/complete` | `service.write` | `{outcome, note?}` |
| POST   | `/service-follow-ups/:id/reopen` | `service.write` | Undo a completion |
| GET    | `/site-visits`           | `sitevisit.read`       | Filters: `tagId`, `personId`, `from`/`to` |
| GET    | `/site-visits/people`    | `sitevisit.write`      | Who can be recorded as the visitor |
| GET    | `/site-visits/:id`       | `sitevisit.read`       | One visit |
| POST   | `/site-visits`           | `sitevisit.write`      | `{visitDate, customerName, siteAddress, purpose, tagIds, personId?, notes?, installationId?}` |
| PATCH  | `/site-visits/:id`       | `sitevisit.write`      | Edit, including tags |
| GET    | `/site-visit-tags`       | `sitevisit.read`       | Active tags (`includeInactive=true` for all, with usage counts) |
| POST   | `/site-visit-tags`       | `sitevisit.manage_tags` | `{name, description?, color?}`. The name is lowercased and hyphenated |
| PATCH  | `/site-visit-tags/:id`   | `sitevisit.manage_tags` | `{name?, description?, color?, isActive?}`. `isActive: false` retires the tag |
| DELETE | `/site-visit-tags/:id`   | `sitevisit.manage_tags` | Delete an unused tag (409 if in use) |
| GET    | `/leave/mine`            | `leave.apply`          | Your applications for a year (`year=`), each with `days` (working days) |
| GET    | `/leave/balance`         | `leave.apply`          | Casual and sick entitlement, taken, pending, remaining, available, and unpaid days. `userId=` needs `leave.approve` |
| GET    | `/leave/lop/mine`        | `leave.apply`          | Your LOP summary for `month=YYYY-MM` |
| GET    | `/leave/calendar`        | `leave.read`           | `from`/`to` (at most about 2 months): holidays and approved leave (plus pending for approvers) |
| POST   | `/leave`                 | `leave.apply`          | Apply: `{type, startDate, endDate, reason}` |
| POST   | `/leave/:id/cancel`      | `leave.apply`          | Withdraw your own (pending, or approved and not started) |
| GET    | `/leave/applications`    | `leave.approve`        | Everyone's, pending first. Filters: `status`, `userId`, `from`/`to` |
| POST   | `/leave/:id/approve`     | `leave.approve`        | `{note?}` (not your own) |
| POST   | `/leave/:id/reject`      | `leave.approve`        | `{note}` (required) |
| GET    | `/holidays`              | `leave.read`           | Holidays for `year=` |
| GET    | `/holidays/upcoming`     | `leave.read`           | Next 3 holidays |
| POST   | `/holidays`              | `holidays.manage`      | `{date, name}` |
| PATCH  | `/holidays/:id`          | `holidays.manage`      | `{date?, name?}` |
| DELETE | `/holidays/:id`          | `holidays.manage`      | Remove a holiday |
| GET    | `/lop/summary`           | `leave.approve`        | `month=YYYY-MM` (`userId=` optional): per-employee working, paid leave, unpaid, absent, LOP, present-equivalent, paid days, pending, and LOP dates |
| GET    | `/lop/absences`          | `leave.approve`        | Absences recorded in a month |
| POST   | `/lop/absences`          | `leave.approve`        | `{userId, date, note?}` |
| DELETE | `/lop/absences/:id`      | `leave.approve`        | Remove an absence recorded by mistake |
| GET    | `/allowances`            | `allowances.read`      | Yours, or everyone's with `allowances.manage`. Filters: `month`, `userId`, `status` |
| GET    | `/allowances/summary`    | `allowances.read`      | `month=`: approved and pending totals per employee, approved by type |
| GET    | `/allowances/linkable`   | `allowances.claim` or `allowances.manage` | Recent site visits and installations the allowance can link to (`userId=` needs manage) |
| POST   | `/allowances`            | `allowances.claim` or `allowances.manage` | `{type, amount, date, description, siteVisitId?, installationId?, userId?}` |
| POST   | `/allowances/:id/approve` | `allowances.manage`   | Approve a pending claim |
| POST   | `/allowances/:id/reject` | `allowances.manage`    | `{note}` (required) |
| DELETE | `/allowances/:id`        | `allowances.claim` or `allowances.manage` | Withdraw your pending claim, or remove any entry (manage) |
| GET    | `/hr/employees`          | `leave.approve` or `allowances.manage` | Active employees, for pickers |

Interactive docs: `http://localhost:4000/api/docs`.

## Web pages

| Page | Needs | What it shows |
|------|-------|---------------|
| `/` Dashboard | logged in | Lead counts, pipeline breakdown, follow-ups due today and overdue, recent leads |
| `/leads` | `leads.read` | Filterable lead list. Filters live in the URL, e.g. `/leads?status=QUOTED` |
| `/leads/new` | `leads.write` | Create a lead. The salesperson picker appears only with `leads.assign` |
| `/leads/:id` | `leads.read` | Details, edit, pipeline buttons, follow-ups (schedule and record outcome) |
| `/leads/import` | `leads.write` | Download the template or the 30-lead sample, upload .csv/.xlsx (Meta exports as is), see created, duplicate and failed rows and who got how many |
| `/leads/won` | `leads.read` | Closed/won leads with win date |
| `/follow-ups` | `leads.read` | Overdue, upcoming and completed tabs |
| `/calendar` | `leads.read` | Month calendar of *your* follow-ups. Users with `leads.read_all` can switch to everyone's |
| `/orders` | `sales.read` | Sales orders. Balances and overdue flags appear with `payments.read`. Convert a lead to an order from a won lead's page |
| `/orders/:id` | `sales.read` | Order details, edit, mark delivered (`stock.write`), cancel, payments (`payments.read`/`payments.write`) |
| `/finance/revenue` | `finance.dashboard` or `sales.read` | Revenue by employee (or "My revenue" for sales) with date presets (this month, last month, this financial year, all time) or a custom range |
| `/admin/users` | `users.read` | Users list. With `users.manage`: **New user** and **Edit** (pick a role, which previews the preset's tags), activate or deactivate, reset password. "View tags" needs `permissions.read` |
| `/admin/permissions` | `permissions.read` | Grid of each role's preset tags |
| `/admin/lead-assignment` | `leads.assign` | A day's leads and their split across the telecallers (Even ✓ check), who is next, and on/off switches for the rotation. "Their leads →" opens the leads list filtered to that person |
| `/admin/api-keys` | `apikeys.manage` | Generate (shown once, with a copy button), list and revoke API keys. API docs with a curl example, and Meta webhook status |
| `/finance/overdue` | `payments.read` | Balance overdue: orders with money owed past the due date, days overdue, sortable |
| `/vendors` | `vendors.read` | Vendor outstanding: what we owe each vendor, with overdue flagged |
| `/vendors/:id` | `vendors.read` | Purchases (unpaid and overdue per bill), payments, and forms to add both |
| `/stock` | `stock.read` | Product cards with low-stock flags, add production or adjust, alert levels, movement log |
| `/installations` | `installations.read` | Month calendar (late in red, done struck through) or a list filterable by status. "Schedule installation" needs `installations.write` |
| `/installations/:id` | `installations.read` | Details, start, complete, reschedule. "Raise service job" appears after completion, with `service.write` |
| `/service` | `service.read` | Service jobs with status, type and priority filters. Rows with an overdue follow-up are red |
| `/service/:id` | `service.read` | Job details, update (`service.write`), and its service follow-ups |
| `/service/follow-ups` | `service.read` | Overdue, upcoming and completed service follow-ups |
| `/site-visits` | `sitevisit.read` | Visits with tag filter chips. "Record visit" needs `sitevisit.write` |
| `/site-visits/:id` | `sitevisit.read` | Visit details and edit |
| `/site-visits/tags` | `sitevisit.manage_tags` | Manage the tag list: add, edit, retire or restore, delete if unused |
| `/leave` | `leave.apply` | My leave: balance cards, this month's LOP, apply, history with withdraw |
| `/leave/calendar` | `leave.read` | Month calendar of holidays (amber) and who is on leave. Click a day for details |
| `/holidays` | `leave.read` | Holiday list by year. Add, edit and remove need `holidays.manage` |
| `/allowances` | `allowances.read` | Month picker, totals (per employee for managers), entries, claim or add form, approve or reject |
| `/leave/approvals` | `leave.approve` | Pending first. Approve, or reject with a reason |
| `/hr/lop` | `leave.approve` | Monthly LOP table (click an LOP number to see its dates), "How this is calculated", and record an absence |

### Role dashboards

The landing page (`/`) is designed around the user's **role** (`web/src/components/dashboards/`). Each dashboard only requests data its tags allow, and checks them again, so a user with extra or missing tags just sees more or fewer cards and never a permission error.

| Role | Dashboard |
|------|-----------|
| **admin** | Executive view. **Money:** total revenue so far, revenue this month, collected so far (advances and payments), what customers owe (red if overdue). **Operations:** installations today (plus next 7 days and late), stock with low items flagged. **People:** leave and allowance claims awaiting approval, who's off today, LOP days this month, and the first few items waiting for a decision |
| **sales** | My open leads, overdue follow-ups (red), my won deals, my revenue this month, pipeline by stage, follow-ups due today and overdue, my week ahead, my latest leads |
| **telecaller** | My assigned leads, calls still to make today, overdue calls (red), upcoming follow-ups, today's call list, my week ahead, assigned leads with tap-to-call numbers. **No money anywhere** |
| **factory_supervisor** | My installations today and this week (switchable to everyone's), with status, site and crew. Open service jobs, most urgent first (overdue follow-ups in red). Low-stock items. **No CRM or finance** |
| any other role | The general dashboard: every card the user's tags allow |

## Useful scripts (in `/api`)

- `npm run db:migrate`: create and apply a new migration after editing `prisma/schema.prisma`
- `npm run db:seed`: re-sync roles and tags and create missing demo users (safe to re-run)
- `npm run db:reset`: **erases the local database**, then re-migrates and re-seeds. Development only.
- `CONFIRM_DEMO_RESET=yes npm run db:reset-demo`, then `npm run db:seed`: empties only the **demo business data** and restarts order and job numbering, then rebuilds it. User accounts, roles and permissions are kept. It refuses to run in production or against a non-local database.
- `npm run meta:test-webhook`: send a signed fake Meta lead to the local API (development only)
- `npm test`: unit tests
- `npm run test:e2e`: end-to-end auth/RBAC tests against the local DB

## Look and feel (web)

- **Primary accent:** a confident blue (`brand-600` = `#2557eb`). It's used on primary buttons, the active sidebar item, links and key highlights.
- **Module colours,** shown on sidebar section dots and icons, page breadcrumbs, and dashboard cards (top bar and icon chip):
  - CRM: **violet**
  - Finance: **emerald**
  - Operations: **amber**
  - HR: **cyan**
  - Admin: **slate**
- **Red is reserved** for overdue or urgent items. Those always also carry a text label ("Overdue", "needs action", "Low"), so meaning never depends on colour alone.
- **Where to change it:** colour tokens are in `web/src/app/globals.css`, module colours in `web/src/lib/modules.ts`, and shared components and styles in `web/src/components/ui.tsx`.
