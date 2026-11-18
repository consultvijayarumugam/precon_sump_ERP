// Which bottom tabs each role sees. Every tab route exists for everyone (the
// router needs them all); the ones not in a role's set are hidden.

export type TabKey = 'index' | 'my-leads' | 'callbacks' | 'schedule' | 'pipeline' | 'visits' | 'more';
export type AppRole = 'telecaller' | 'sales' | 'other';

/** In the order the routes are declared in app/(tabs)/_layout.tsx. */
export const ALL_TABS: TabKey[] = ['index', 'my-leads', 'callbacks', 'schedule', 'pipeline', 'visits', 'more'];

export const TAB_SETS: Record<AppRole, TabKey[]> = {
  telecaller: ['index', 'my-leads', 'callbacks', 'schedule', 'more'],
  sales: ['index', 'my-leads', 'pipeline', 'visits', 'more'],
  // Admins and others: the phone app has nothing role-specific for them yet.
  other: ['index', 'more'],
};

export function appRole(roleKey: string): AppRole {
  return roleKey === 'telecaller' || roleKey === 'sales' ? roleKey : 'other';
}

export const tabVisible = (role: AppRole, tab: TabKey) => TAB_SETS[role].includes(tab);

/** A tab badge: hidden at 0, capped so it fits. */
export const badge = (n: number | null | undefined) => (!n ? undefined : n > 99 ? '99+' : n);
