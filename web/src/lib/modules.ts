// Each module has a soft colour identity, used on sidebar icons, page
// breadcrumbs and dashboard cards. Full class strings so Tailwind keeps them.
// Red is NOT a module colour: it only ever means overdue / urgent.

export type ModuleKey = "home" | "crm" | "finance" | "operations" | "hr" | "admin";

export interface ModuleStyle {
  label: string;
  /** Small solid dot / bar. */
  dot: string;
  /** Icon tint on the dark sidebar. */
  sidebarIcon: string;
  /** Section header text on the dark sidebar. */
  sidebarLabel: string;
  /** Soft icon chip on white (cards, tiles). */
  chip: string;
  /** Accent text on white (AA contrast). */
  text: string;
  /** Hover border on cards. */
  hoverBorder: string;
}

export const MODULES: Record<ModuleKey, ModuleStyle> = {
  home: {
    label: "Dashboard",
    dot: "bg-brand-500",
    sidebarIcon: "text-brand-300",
    sidebarLabel: "text-brand-300",
    chip: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
    text: "text-brand-700 dark:text-brand-300",
    hoverBorder: "hover:border-brand-300",
  },
  crm: {
    label: "CRM",
    dot: "bg-violet-500",
    sidebarIcon: "text-violet-300",
    sidebarLabel: "text-violet-300",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    text: "text-violet-700 dark:text-violet-300",
    hoverBorder: "hover:border-violet-300",
  },
  finance: {
    label: "Finance",
    dot: "bg-emerald-500",
    sidebarIcon: "text-emerald-300",
    sidebarLabel: "text-emerald-300",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    text: "text-emerald-700 dark:text-emerald-300",
    hoverBorder: "hover:border-emerald-300",
  },
  operations: {
    label: "Operations",
    dot: "bg-amber-500",
    sidebarIcon: "text-amber-300",
    sidebarLabel: "text-amber-300",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    text: "text-amber-800 dark:text-amber-300",
    hoverBorder: "hover:border-amber-300",
  },
  hr: {
    label: "HR",
    dot: "bg-cyan-500",
    sidebarIcon: "text-cyan-300",
    sidebarLabel: "text-cyan-300",
    chip: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
    text: "text-cyan-800 dark:text-cyan-300",
    hoverBorder: "hover:border-cyan-300",
  },
  admin: {
    label: "Admin",
    dot: "bg-slate-400",
    sidebarIcon: "text-slate-300",
    sidebarLabel: "text-slate-300",
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    text: "text-slate-700 dark:text-slate-300",
    hoverBorder: "hover:border-slate-300",
  },
};

/** API permission modules -> sidebar module. */
export function moduleForTagModule(tagModule: string): ModuleKey {
  if (tagModule === "stock" || tagModule === "service") return "operations";
  if (tagModule === "crm" || tagModule === "finance" || tagModule === "hr" || tagModule === "admin") return tagModule;
  return "admin";
}
