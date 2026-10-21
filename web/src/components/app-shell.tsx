"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { TAGS } from "@/lib/tags";

// Each nav item names the tag it needs; items the user can't use are hidden,
// and empty groups disappear.
const NAV_GROUPS: { items: { href: string; label: string; tag?: string }[] }[] = [
  { items: [{ href: "/", label: "Dashboard" }] },
  {
    items: [
      { href: "/leads", label: "Leads", tag: TAGS.LEADS_READ },
      { href: "/leads/won", label: "Won", tag: TAGS.LEADS_READ },
      { href: "/follow-ups", label: "Follow-ups", tag: TAGS.LEADS_READ },
      { href: "/calendar", label: "Calendar", tag: TAGS.LEADS_READ },
    ],
  },
  {
    items: [
      { href: "/orders", label: "Orders", tag: TAGS.SALES_READ },
      { href: "/finance/revenue", label: "Revenue", tag: TAGS.FINANCE_DASHBOARD },
      { href: "/finance/overdue", label: "Overdue", tag: TAGS.PAYMENTS_READ },
      { href: "/vendors", label: "Vendors", tag: TAGS.VENDORS_READ },
    ],
  },
  { items: [{ href: "/stock", label: "Stock", tag: TAGS.STOCK_READ }] },
  {
    items: [
      { href: "/installations", label: "Installations", tag: TAGS.INSTALLATIONS_READ },
      { href: "/service", label: "Service jobs", tag: TAGS.SERVICE_READ },
      { href: "/service/follow-ups", label: "Service follow-ups", tag: TAGS.SERVICE_READ },
      { href: "/site-visits", label: "Site visits", tag: TAGS.SITEVISIT_READ },
    ],
  },
];

const ALL_HREFS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));

/** The nav item to highlight: the longest href that the current path falls under. */
function activeHref(pathname: string): string | undefined {
  return ALL_HREFS.filter((href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
}

function Shell({ children }: { children: ReactNode }) {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();

  const current = activeHref(pathname);
  const isActive = (href: string) => href === current;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            Precon ERP
          </Link>
          <nav className="order-last flex w-full flex-wrap gap-1 text-sm">
            {NAV_GROUPS.map((group) => group.items.filter((item) => !item.tag || can(item.tag)))
              .filter((items) => items.length > 0)
              .map((items, i) => (
                <div key={i} className={`flex flex-wrap gap-1 ${i > 0 ? "border-l border-neutral-200 pl-1 dark:border-neutral-800" : ""}`}>
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded px-2 py-1 ${
                        isActive(item.href)
                          ? "bg-neutral-200 font-medium dark:bg-neutral-800"
                          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-neutral-500">
              {user.fullName} · {user.role.name}
            </span>
            <button
              onClick={logout}
              className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

/** Signed-in chrome: loads the user, then shows the tag-gated nav around the page. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
