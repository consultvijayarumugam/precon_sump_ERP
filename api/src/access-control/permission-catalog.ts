/**
 * The single list of permission tags the system knows about, and the default
 * tags each role gets. The seed script writes this into the database; the API
 * reads tags from the database at request time, so admin changes apply at once.
 *
 * Adding a module later = add its tags here, re-run the seed, and protect its
 * endpoints with @RequirePermissions(...).
 */

export const PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  PERMISSIONS_READ: 'permissions.read',
  PERMISSIONS_ASSIGN: 'permissions.assign',
  APIKEYS_MANAGE: 'apikeys.manage',
  LEADS_READ: 'leads.read',
  LEADS_READ_ALL: 'leads.read_all',
  LEADS_WRITE: 'leads.write',
  LEADS_QUALIFY: 'leads.qualify',
  LEADS_ASSIGN: 'leads.assign',
  LEADS_AUTO_ASSIGN: 'leads.auto_assign',
  LEADS_RECEIVE_QUALIFIED: 'leads.receive_qualified',
  FOLLOWUPS_WRITE: 'followups.write',
  SALES_READ: 'sales.read',
  SALES_READ_ALL: 'sales.read_all',
  SALES_WRITE: 'sales.write',
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_WRITE: 'payments.write',
  VENDORS_READ: 'vendors.read',
  VENDORS_WRITE: 'vendors.write',
  STOCK_READ: 'stock.read',
  STOCK_WRITE: 'stock.write',
  FINANCE_DASHBOARD: 'finance.dashboard',
  INSTALLATIONS_READ: 'installations.read',
  INSTALLATIONS_WRITE: 'installations.write',
  SERVICE_READ: 'service.read',
  SERVICE_READ_ALL: 'service.read_all',
  SERVICE_WRITE: 'service.write',
  SITEVISIT_READ: 'sitevisit.read',
  SITEVISIT_WRITE: 'sitevisit.write',
  SITEVISIT_MANAGE_TAGS: 'sitevisit.manage_tags',
  LEAVE_APPLY: 'leave.apply',
  LEAVE_READ: 'leave.read',
  LEAVE_APPROVE: 'leave.approve',
  HOLIDAYS_MANAGE: 'holidays.manage',
  ALLOWANCES_READ: 'allowances.read',
  ALLOWANCES_CLAIM: 'allowances.claim',
  ALLOWANCES_MANAGE: 'allowances.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DEFINITIONS: {
  key: PermissionKey;
  module: string;
  description: string;
}[] = [
  {
    key: PERMISSIONS.USERS_READ,
    module: 'admin',
    description: 'View the list of users',
  },
  {
    key: PERMISSIONS.USERS_MANAGE,
    module: 'admin',
    description: "Create users, edit them, change their role (which resets their tags to the role's preset)",
  },
  {
    key: PERMISSIONS.PERMISSIONS_READ,
    module: 'admin',
    description: 'View roles and the permission-tag catalog',
  },
  {
    key: PERMISSIONS.PERMISSIONS_ASSIGN,
    module: 'admin',
    description: 'Grant or revoke permission tags for individual users',
  },
  {
    key: PERMISSIONS.APIKEYS_MANAGE,
    module: 'admin',
    description: 'Create, view and revoke API keys for the public create-lead API',
  },
  {
    key: PERMISSIONS.LEADS_READ,
    module: 'crm',
    description: 'View leads assigned to you, their follow-ups and calendar',
  },
  {
    key: PERMISSIONS.LEADS_READ_ALL,
    module: 'crm',
    description: 'View every lead, including unassigned ones (widens leads.read)',
  },
  {
    key: PERMISSIONS.LEADS_WRITE,
    module: 'crm',
    description: 'Create leads and edit leads you can see',
  },
  {
    key: PERMISSIONS.LEADS_QUALIFY,
    module: 'crm',
    description:
      'Update leads assigned to you after a call: name, email, city, product, size, notes, status. Not phone or source; no creating, importing or reassigning',
  },
  {
    key: PERMISSIONS.LEADS_ASSIGN,
    module: 'crm',
    description: 'Assign or reassign a lead to a salesperson',
  },
  {
    key: PERMISSIONS.LEADS_AUTO_ASSIGN,
    module: 'crm',
    description: 'Receive new incoming leads (import, API, Meta) by round-robin',
  },
  {
    key: PERMISSIONS.LEADS_RECEIVE_QUALIFIED,
    module: 'crm',
    description: 'Receive leads that telecallers qualify and hand over (round-robin across sales)',
  },
  {
    key: PERMISSIONS.FOLLOWUPS_WRITE,
    module: 'crm',
    description: 'Schedule, edit and complete follow-ups on leads you can see',
  },
  {
    key: PERMISSIONS.SALES_READ,
    module: 'finance',
    description: 'View sales orders credited to you',
  },
  {
    key: PERMISSIONS.SALES_READ_ALL,
    module: 'finance',
    description: 'View every sales order (widens sales.read)',
  },
  {
    key: PERMISSIONS.SALES_WRITE,
    module: 'finance',
    description: 'Convert won leads into sales orders and edit/cancel orders you can see',
  },
  {
    key: PERMISSIONS.PAYMENTS_READ,
    module: 'finance',
    description: 'See customer payments, balances and the balance-overdue list',
  },
  {
    key: PERMISSIONS.PAYMENTS_WRITE,
    module: 'finance',
    description: 'Record customer payments against sales orders',
  },
  {
    key: PERMISSIONS.VENDORS_READ,
    module: 'finance',
    description: 'View vendors, purchases, vendor payments and outstanding payables',
  },
  {
    key: PERMISSIONS.VENDORS_WRITE,
    module: 'finance',
    description: 'Add/edit vendors and record purchases and vendor payments',
  },
  {
    key: PERMISSIONS.STOCK_READ,
    module: 'stock',
    description: 'View finished-goods stock and movements',
  },
  {
    key: PERMISSIONS.STOCK_WRITE,
    module: 'stock',
    description: 'Add production, adjust stock, set thresholds, and mark orders delivered',
  },
  {
    key: PERMISSIONS.FINANCE_DASHBOARD,
    module: 'finance',
    description: 'Revenue by employee and company-wide finance totals',
  },
  {
    key: PERMISSIONS.INSTALLATIONS_READ,
    module: 'service',
    description: 'View the installation schedule and installation details',
  },
  {
    key: PERMISSIONS.INSTALLATIONS_WRITE,
    module: 'service',
    description: 'Schedule, assign, start and complete installations',
  },
  {
    key: PERMISSIONS.SERVICE_READ,
    module: 'service',
    description: 'View service jobs for customers you sold to or jobs assigned to you',
  },
  {
    key: PERMISSIONS.SERVICE_READ_ALL,
    module: 'service',
    description: 'View every service job (widens service.read)',
  },
  {
    key: PERMISSIONS.SERVICE_WRITE,
    module: 'service',
    description: 'Raise and update service jobs and their follow-ups (jobs you can see)',
  },
  {
    key: PERMISSIONS.SITEVISIT_READ,
    module: 'service',
    description: 'View site visits',
  },
  {
    key: PERMISSIONS.SITEVISIT_WRITE,
    module: 'service',
    description: 'Record and edit site visits and choose their tags',
  },
  {
    key: PERMISSIONS.SITEVISIT_MANAGE_TAGS,
    module: 'service',
    description: 'Manage the list of site-visit tags',
  },
  {
    key: PERMISSIONS.LEAVE_APPLY,
    module: 'hr',
    description: 'Apply for your own leave; see your own leave history, balance and LOP',
  },
  {
    key: PERMISSIONS.LEAVE_READ,
    module: 'hr',
    description: 'See the team calendar: company holidays and who is on approved leave',
  },
  {
    key: PERMISSIONS.LEAVE_APPROVE,
    module: 'hr',
    description: "Approve/reject anyone's leave, record unapproved absences, see everyone's LOP summary",
  },
  {
    key: PERMISSIONS.HOLIDAYS_MANAGE,
    module: 'hr',
    description: 'Add, edit and remove company holidays',
  },
  {
    key: PERMISSIONS.ALLOWANCES_READ,
    module: 'hr',
    description: 'See your own allowances and monthly total',
  },
  {
    key: PERMISSIONS.ALLOWANCES_CLAIM,
    module: 'hr',
    description: 'Submit your own allowance claims for approval',
  },
  {
    key: PERMISSIONS.ALLOWANCES_MANAGE,
    module: 'hr',
    description: "See everyone's allowances, add them for anyone, approve/reject claims",
  },
];

/** Every employee: their own leave (plus team calendar/holidays) and their own allowances. */
const OWN_LEAVE_AND_ALLOWANCES: PermissionKey[] = [
  PERMISSIONS.LEAVE_APPLY,
  PERMISSIONS.LEAVE_READ,
  PERMISSIONS.ALLOWANCES_READ,
  PERMISSIONS.ALLOWANCES_CLAIM,
];

export const ROLES = {
  ADMIN: 'admin',
  SALES: 'sales',
  TELECALLER: 'telecaller',
  FACTORY_SUPERVISOR: 'factory_supervisor',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

/**
 * ROLE PRESETS (requirement #20). Picking a role for a user gives them exactly
 * this set of tags; admins normally never pick individual tags. "Own" scoping
 * (e.g. sales only see their own leads/orders) comes from the *_read tags
 * without the matching *_read_all tag.
 */
export const ROLE_DEFINITIONS: {
  key: RoleKey;
  name: string;
  description: string;
  defaultPermissions: PermissionKey[];
}[] = [
  {
    key: ROLES.ADMIN,
    name: 'Admin',
    description: 'Everything, including users, roles and approvals',
    // Every capability. leads.auto_assign / leads.receive_qualified aren't ones:
    // they put the holder in a round-robin (telecallers / sales), not the admin.
    defaultPermissions: PERMISSION_DEFINITIONS.map((p) => p.key).filter(
      (k) => k !== PERMISSIONS.LEADS_AUTO_ASSIGN && k !== PERMISSIONS.LEADS_RECEIVE_QUALIFIED,
    ),
  },
  {
    key: ROLES.SALES,
    name: 'Sales',
    description: 'Own leads, follow-ups, won leads, own orders and revenue, site visits, own leave and allowances',
    defaultPermissions: [
      // CRM: own leads (read/write), won, follow-ups, calendar; receives qualified leads
      PERMISSIONS.LEADS_READ,
      PERMISSIONS.LEADS_WRITE,
      PERMISSIONS.LEADS_RECEIVE_QUALIFIED,
      PERMISSIONS.FOLLOWUPS_WRITE,
      // Finance: own orders (read/write) and own revenue
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_WRITE,
      // Operations: site visits
      PERMISSIONS.SITEVISIT_READ,
      PERMISSIONS.SITEVISIT_WRITE,
      ...OWN_LEAVE_AND_ALLOWANCES,
    ],
  },
  {
    key: ROLES.TELECALLER,
    name: 'Telecaller',
    description: 'Own leads: qualify them (update details and status), follow-ups, calendar; receives round-robin leads; own leave and allowances',
    defaultPermissions: [
      PERMISSIONS.LEADS_READ,
      PERMISSIONS.LEADS_QUALIFY,
      PERMISSIONS.LEADS_AUTO_ASSIGN,
      PERMISSIONS.FOLLOWUPS_WRITE,
      ...OWN_LEAVE_AND_ALLOWANCES,
    ],
  },
  {
    key: ROLES.FACTORY_SUPERVISOR,
    name: 'Factory Supervisor',
    description: 'Stock, installations, service jobs and follow-ups, site visits, own leave and allowances',
    defaultPermissions: [
      PERMISSIONS.STOCK_READ,
      PERMISSIONS.STOCK_WRITE,
      PERMISSIONS.INSTALLATIONS_READ,
      PERMISSIONS.INSTALLATIONS_WRITE,
      // Service jobs + service follow-ups, for every customer (they run the service team)
      PERMISSIONS.SERVICE_READ,
      PERMISSIONS.SERVICE_READ_ALL,
      PERMISSIONS.SERVICE_WRITE,
      PERMISSIONS.SITEVISIT_READ,
      PERMISSIONS.SITEVISIT_WRITE,
      ...OWN_LEAVE_AND_ALLOWANCES,
    ],
  },
];
