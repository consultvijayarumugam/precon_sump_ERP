// Which bottom tabs each role sees. Every tab route exists for everyone (the
// router needs them all); the ones not in a role's set are hidden.

export type TabKey = 'index' | 'my-leads' | 'callbacks' | 'schedule' | 'pipeline' | 'visits' | 'more';
export type AppRole = 'telecaller' | 'sales' | 'admin' | 'other';

/** In the order the routes are declared in app/(tabs)/_layout.tsx. */
export const ALL_TABS: TabKey[] = ['index', 'my-leads', 'callbacks', 'schedule', 'pipeline', 'visits', 'more'];

export const TAB_SETS: Record<AppRole, TabKey[]> = {
  telecaller: ['index', 'my-leads', 'callbacks', 'schedule', 'more'],
  sales: ['index', 'my-leads', 'pipeline', 'visits', 'more'],
  // The CRM for the whole team: dashboard, all leads, everyone's follow-ups, site visits;
  // calendar, reports and notifications in More. Setup (users, permissions, stages,
  // templates, files) stays on the web.
  admin: ['index', 'my-leads', 'callbacks', 'visits', 'more'],
  // Other roles (e.g. factory supervisor): nothing in the phone app yet.
  other: ['index', 'more'],
};

export function appRole(roleKey: string): AppRole {
  return roleKey === 'telecaller' || roleKey === 'sales' || roleKey === 'admin' ? roleKey : 'other';
}

/** Tab labels that differ by role (the routes are shared). */
export function tabLabel(role: AppRole, tab: TabKey): string {
  switch (tab) {
    case 'index':
      return 'Home';
    case 'my-leads':
      return role === 'admin' ? 'Leads' : 'My Leads';
    case 'callbacks':
      return role === 'admin' ? 'Follow-ups' : 'Callbacks';
    case 'schedule':
      return 'Calendar';
    case 'pipeline':
      return 'Pipeline';
    case 'visits':
      return 'Site Visits';
    case 'more':
      return 'More';
  }
}

export const tabVisible = (role: AppRole, tab: TabKey) => TAB_SETS[role].includes(tab);

/** A tab badge: hidden at 0, capped so it fits. */
export const badge = (n: number | null | undefined) => (!n ? undefined : n > 99 ? '99+' : n);
