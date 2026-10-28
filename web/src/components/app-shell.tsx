"use client";

import {
  BarChart3,
  Boxes,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Contact,
  HardHat,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  type LucideIcon,
  MapPin,
  MessageCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PartyPopper,
  PhoneCall,
  Receipt,
  ShieldCheck,
  Shuffle,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Truck,
  Umbrella,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { MODULES, ModuleKey } from "@/lib/modules";
import { TAGS } from "@/lib/tags";
import { NotificationBell } from "@/components/notification-bell";
import { isOperationsPath } from "@/lib/features";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission tag needed to see the item; none = everyone signed in. */
  tag?: string;
  /** Alternatively: shown if the user holds ANY of these tags. */
  anyTags?: string[];
  /** Part of the operations modules (hidden while OPERATIONS_ENABLED is off). */
  operations?: boolean;
}

// Sections by module. Items the user lacks the tag for are hidden, and a
// section with no visible items disappears entirely. The API still enforces
// every tag; this only decides what is worth showing.
// `whenAny`: the whole section shows only with one of these tags (keeps back-office
// sections off the telecaller and sales screens; their pages and APIs are unchanged).
// `operations`: part of the operations modules, shown only while OPERATIONS_ENABLED is on.
const NAV: { module: ModuleKey; title?: string; whenAny?: string[]; operations?: boolean; items: NavItem[] }[] = [
  { module: "home", items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  {
    module: "crm",
    title: "CRM",
    items: [
      { href: "/leads", label: "Leads", icon: Contact, tag: TAGS.LEADS_READ },
      { href: "/leads/won", label: "Won", icon: Trophy, anyTags: [TAGS.LEADS_WRITE, TAGS.LEADS_READ_ALL] },
      { href: "/follow-ups", label: "Follow-ups", icon: PhoneCall, tag: TAGS.LEADS_READ },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, tag: TAGS.LEADS_READ },
      { href: "/site-visits", label: "Site visits", icon: MapPin, tag: TAGS.SITEVISIT_READ },
      { href: "/reports", label: "Reports", icon: BarChart3, anyTags: [TAGS.REPORTS_VIEW, TAGS.REPORTS_VIEW_ALL] },
    ],
  },
  {
    module: "finance",
    title: "Finance",
    operations: true,
    whenAny: [TAGS.FINANCE_DASHBOARD],
    items: [
      { href: "/orders", label: "Orders", icon: Receipt, tag: TAGS.SALES_READ },
      { href: "/finance/revenue", label: "Revenue", icon: TrendingUp, anyTags: [TAGS.FINANCE_DASHBOARD, TAGS.SALES_READ] },
      { href: "/finance/overdue", label: "Overdue payments", icon: TriangleAlert, tag: TAGS.PAYMENTS_READ },
      { href: "/vendors", label: "Vendors", icon: Truck, tag: TAGS.VENDORS_READ },
    ],
  },
  {
    module: "operations",
    title: "Operations",
    operations: true,
    items: [
      { href: "/stock", label: "Stock", icon: Boxes, tag: TAGS.STOCK_READ },
      { href: "/installations", label: "Installations", icon: HardHat, tag: TAGS.INSTALLATIONS_READ },
      { href: "/service", label: "Service jobs", icon: Wrench, tag: TAGS.SERVICE_READ },
      { href: "/service/follow-ups", label: "Service follow-ups", icon: ListChecks, tag: TAGS.SERVICE_READ },
    ],
  },
  {
    module: "hr",
    title: "HR",
    operations: true,
    items: [
      { href: "/leave", label: "My leave", icon: Umbrella, tag: TAGS.LEAVE_APPLY },
      { href: "/leave/calendar", label: "Team calendar", icon: CalendarCheck, tag: TAGS.LEAVE_READ },
      { href: "/leave/approvals", label: "Leave approvals", icon: ClipboardList, tag: TAGS.LEAVE_APPROVE },
      { href: "/holidays", label: "Holidays", icon: PartyPopper, tag: TAGS.LEAVE_READ },
      { href: "/hr/lop", label: "LOP", icon: CalendarClock, tag: TAGS.LEAVE_APPROVE },
      { href: "/allowances", label: "Allowances", icon: Wallet, tag: TAGS.ALLOWANCES_READ },
    ],
  },
  {
    module: "admin",
    title: "Admin",
    items: [
      { href: "/admin/overview", label: "Business overview", icon: LayoutDashboard, tag: TAGS.FINANCE_DASHBOARD, operations: true },
      { href: "/admin/users", label: "Users", icon: Users, tag: TAGS.USERS_READ },
      { href: "/admin/permissions", label: "Permissions & tags", icon: ShieldCheck, tag: TAGS.PERMISSIONS_READ },
      { href: "/admin/lead-assignment", label: "Lead assignment", icon: Shuffle, tag: TAGS.LEADS_ASSIGN },
      { href: "/admin/message-templates", label: "Message templates", icon: MessageCircle, tag: TAGS.TEMPLATES_MANAGE },
      { href: "/admin/api-keys", label: "API keys", icon: KeyRound, tag: TAGS.APIKEYS_MANAGE },
    ],
  },
];

const ALL_HREFS = NAV.flatMap((s) => s.items.map((i) => i.href));

/** The section (module) and item for a path, for the breadcrumb. */
function sectionFor(href: string | undefined) {
  for (const section of NAV) {
    const item = section.items.find((i) => i.href === href);
    if (item) return { section, item };
  }
  return null;
}

/** The nav item to highlight: the longest href that the current path falls under. */
function activeHref(pathname: string): string | undefined {
  return ALL_HREFS.filter((href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
}

const COLLAPSE_KEY = "precon.sidebarCollapsed";

/** "Precon ERP" wordmark: three stacked concrete blocks + the name. */
function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Precon ERP home">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm">
        <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
          <rect x="3" y="3" width="14" height="4" rx="1" fill="white" />
          <rect x="3" y="8.5" width="9" height="4" rx="1" fill="white" opacity="0.85" />
          <rect x="13.5" y="8.5" width="3.5" height="4" rx="1" fill="white" opacity="0.85" />
          <rect x="3" y="14" width="14" height="3" rx="1" fill="white" opacity="0.7" />
        </svg>
      </span>
      {!compact && (
        <span className="text-[15px] leading-none tracking-tight text-white">
          <span className="font-semibold">Precon</span> <span className="font-light text-brand-300">ERP</span>
        </span>
      )}
    </Link>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function SidebarContent({
  collapsed,
  onToggleCollapse,
  onNavigate,
  onClose,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const { user, can, logout, operations } = useAuth();
  const pathname = usePathname();
  const current = activeHref(pathname);
  const visible = (i: NavItem) => (!i.operations || operations) && (i.anyTags ? i.anyTags.some(can) : !i.tag || can(i.tag));
  const sections = NAV.filter((s) => (!s.operations || operations) && (!s.whenAny || s.whenAny.some(can)))
    .map((s) => ({ ...s, items: s.items.filter(visible) }))
    .filter(
    (s) => s.items.length > 0,
  );

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-200">
      <div className={`flex h-16 shrink-0 items-center border-b border-white/10 ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        <Logo compact={collapsed} />
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close menu">
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-label="Main">
        {sections.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title &&
              (collapsed ? (
                <div className="mx-2 mb-2 border-t border-white/10" aria-hidden />
              ) : (
                <div className={`mb-1.5 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider ${MODULES[section.module].sidebarLabel}`}>
                  <span className={`size-1.5 rounded-full ${MODULES[section.module].dot}`} aria-hidden />
                  {section.title}
                </div>
              ))}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === current;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors ${collapsed ? "justify-center" : ""} ${
                        active
                          ? "bg-brand-600 font-semibold text-white shadow-sm shadow-brand-950/40"
                          : "text-slate-300 hover:bg-white/8 hover:text-white"
                      }`}
                    >
                      <Icon
                        className={`size-[18px] shrink-0 ${active ? "text-white" : `${MODULES[section.module].sidebarIcon} group-hover:text-white`}`}
                        aria-hidden
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className={`flex items-center gap-3 ${collapsed ? "flex-col" : ""}`}>
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-semibold text-white"
            title={collapsed ? `${user.fullName} · ${user.role.name}` : undefined}
          >
            {initials(user.fullName)}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user.fullName}</div>
              <div className="truncate text-xs text-slate-400">{user.role.name}</div>
            </div>
          )}
          <button
            onClick={logout}
            className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={`mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-400 hover:bg-white/8 hover:text-white ${
              collapsed ? "justify-center" : ""
            }`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && "Collapse sidebar"}
          </button>
        )}
      </div>
    </div>
  );
}

/** "● CRM / Leads" above the page, in the module's colour. */
function Breadcrumb() {
  const pathname = usePathname();
  const found = sectionFor(activeHref(pathname));
  if (!found || found.section.module === "home") return null;
  const mod = MODULES[found.section.module];
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
      <span className={`size-2 rounded-full ${mod.dot}`} aria-hidden />
      <span className={mod.text}>{mod.label}</span>
      <span className="text-neutral-300 dark:text-neutral-600">/</span>
      <span className="text-neutral-500">{found.item.label}</span>
    </div>
  );
}

/** Shown instead of an operations page while OPERATIONS_ENABLED is off (also for typed URLs). */
function OperationsOff() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <h1 className="text-xl font-bold tracking-tight">This module isn&apos;t available</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Precon ERP is running as the sales and telecaller CRM. Finance, stock, service, installations and HR are switched off for now.
      </p>
      <Link href="/" className="mt-5 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        Go to the dashboard
      </Link>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { user, operations } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // Storage may be blocked; the toggle still works for this visit.
      }
      return !c;
    });
  };

  // Close the phone drawer with Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-slate-800 transition-[width] duration-200 lg:block ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </aside>

      {/* Phone / tablet: slim top bar + slide-in drawer */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white/95 px-4 backdrop-blur lg:hidden dark:border-neutral-800 dark:bg-neutral-950/95">
        <button
          onClick={() => setDrawerOpen(true)}
          className="-ml-1 rounded-md p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <span className="text-[15px] font-semibold tracking-tight">
          Precon <span className="font-light text-brand-600 dark:text-brand-300">ERP</span>
        </span>
        <span className="ml-auto">
          <NotificationBell />
        </span>
        <span
          className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-semibold text-white"
          title={`${user.fullName} · ${user.role.name}`}
        >
          {initials(user.fullName)}
        </span>
      </header>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-neutral-950/40" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <SidebarContent collapsed={false} onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64"}`}>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="flex items-start justify-between gap-3">
            <Breadcrumb />
            <div className="ml-auto hidden lg:block">
              <NotificationBell />
            </div>
          </div>
          {!operations && isOperationsPath(pathname) ? <OperationsOff /> : children}
        </main>
      </div>
    </div>
  );
}

/** Signed-in chrome: loads the user, then shows the tag-gated sidebar around the page. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}

