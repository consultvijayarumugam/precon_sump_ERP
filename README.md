# Precon ERP

ERP for a UG sump / bio-septic tank / precast concrete manufacturer. See `CLAUDE.md` for the full scope and build phases.

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
| telecaller         | telecaller@precon.local (Tara) |
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
  - UG sump: 12 nos
  - Bio-septic tank: 3 nos, which is **below its alert level of 5**
  - Microbes: 40 packs
  - Precast panels: 150
- **4 sales orders from won leads:**
  - SO-0001 Senthil Farms (Suresh): ₹8,000 of ₹18,000 **overdue**
  - SO-0002 Divya Hospital (Priya): ₹2,20,000 of ₹4,20,000 **overdue**
  - SO-0003 Sri Murugan Residency (Suresh): ₹45,000 due in 10 days, not yet delivered
  - SO-0004 Kongu Engineering College (Priya): fully paid
- **2 won leads with no order yet**, for trying the conversion: Sakthi Hardware Stores (Suresh) and Palani Hill Resorts (Priya).
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
| `leads.assign` | Choose or change a lead's salesperson |
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
- **Not built yet:** the Meta Lead Ads webhook. Leads with source `META` are entered by hand for now. The webhook needs a Meta app, a verify token and a page access token.

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
| POST   | `/leads`                 | `leads.write`          | Create: `{name, phone, source, productInterest, email?, city?, status?, notes?, assignedToId?}`. `assignedToId` for someone else needs `leads.assign` |
| PATCH  | `/leads/:id`             | `leads.write`          | Edit any field or move it in the pipeline. Changing `assignedToId` needs `leads.assign` |
| GET    | `/follow-ups`            | `leads.read`           | Follow-ups in your scope. `state=pending\|overdue\|upcoming\|completed`, `from`/`to` (ISO, for the calendar), `assignedTo=me` |
| POST   | `/leads/:leadId/follow-ups` | `followups.write`   | Schedule: `{scheduledAt, note?}` |
| PATCH  | `/follow-ups/:id`        | `followups.write`      | Reschedule or edit the note |
| POST   | `/follow-ups/:id/complete` | `followups.write`    | Record the outcome: `{outcome, note?}` |
| POST   | `/follow-ups/:id/reopen` | `followups.write`      | Undo a completion |
| GET    | `/sales-orders`          | `sales.read`           | Orders in your scope. Filters: `status`, `from`/`to` (order date), `salespersonId`, `page`, `pageSize`. Includes `amountPaid`/`balanceDue`/`isOverdue` only with `payments.read` |
| GET    | `/sales-orders/summary`  | `sales.read`           | Your orders and value this month, and orders awaiting delivery |
| GET    | `/sales-orders/:id`      | `sales.read`           | One order; its payments are included with `payments.read` |
| POST   | `/sales-orders`          | `sales.write` + `leads.read` | Convert a WON lead: `{leadId, quantity, totalAmount, product?, orderDate?, dueDate?, notes?, salespersonId?}` |
| PATCH  | `/sales-orders/:id`      | `sales.write`          | Edit total, dates, notes, salesperson. Product and quantity only before delivery |
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
| GET    | `/stock`                 | `stock.read`           | Products with quantity on hand, alert level, `isLow` |
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
| `/leads/won` | `leads.read` | Closed/won leads with win date |
| `/follow-ups` | `leads.read` | Overdue, upcoming and completed tabs |
| `/calendar` | `leads.read` | Month calendar of *your* follow-ups. Users with `leads.read_all` can switch to everyone's |
| `/orders` | `sales.read` | Sales orders. Balances and overdue flags appear with `payments.read`. Convert a lead to an order from a won lead's page |
| `/orders/:id` | `sales.read` | Order details, edit, mark delivered (`stock.write`), cancel, payments (`payments.read`/`payments.write`) |
| `/finance/revenue` | `finance.dashboard` or `sales.read` | Revenue by employee (or "My revenue" for sales) with date presets (this month, last month, this financial year, all time) or a custom range |
| `/admin/users` | `users.read` | Users list. With `users.manage`: **New user** and **Edit** (pick a role, which previews the preset's tags), activate or deactivate, reset password. "View tags" needs `permissions.read` |
| `/admin/permissions` | `permissions.read` | Grid of each role's preset tags |
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
