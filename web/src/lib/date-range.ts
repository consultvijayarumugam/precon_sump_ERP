// Date ranges for filters and dashboards: presets (Today ... All time) and custom from/to.

/** YYYY-MM-DD of a date in local time. */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A chosen period: both ends are calendar days (YYYY-MM-DD, inclusive); none = all time. */
export interface DateRange {
  preset: PresetKey | "custom";
  from?: string;
  to?: string;
}

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"];

/** The presets the dashboards offer (a dashboard always covers some period). */
export const DASHBOARD_PRESETS: PresetKey[] = ["today", "week", "month", "lastMonth"];

export const ALL_TIME: DateRange = { preset: "all" };

/** The days a preset covers, in local time (weeks start on Monday). */
export function presetRange(key: PresetKey, now = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = (date: Date) => dayKey(date);
  switch (key) {
    case "today":
      return { preset: key, from: d(now), to: d(now) };
    case "week": {
      const monday = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7));
      return { preset: key, from: d(monday), to: d(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
    }
    case "month":
      return { preset: key, from: d(new Date(y, m, 1)), to: d(new Date(y, m + 1, 0)) };
    case "lastMonth":
      return { preset: key, from: d(new Date(y, m - 1, 1)), to: d(new Date(y, m, 0)) };
    case "year":
      return { preset: key, from: d(new Date(y, 0, 1)), to: d(new Date(y, 11, 31)) };
    default:
      return ALL_TIME;
  }
}

/** A range kept in the URL (?period=month or ?period=custom&from=..&to=..) back as a DateRange. */
export function rangeFromParams(period: string | null, from: string | null, to: string | null, fallback: DateRange = ALL_TIME): DateRange {
  if (period === "custom" && (from || to)) return { preset: "custom", from: from || undefined, to: to || undefined };
  const preset = PRESETS.find((p) => p.key === period);
  return preset ? presetRange(preset.key) : fallback;
}

const short = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const full = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const asDate = (k: string) => new Date(`${k}T00:00:00`);

/** "This month (1 Oct - 31 Oct 2026)", "1 Sep - 30 Sep 2026", "From 1 Sep 2026", "All time". */
export function rangeLabel(r: DateRange): string {
  const span =
    r.from && r.to
      ? r.from === r.to
        ? full.format(asDate(r.from))
        : `${(r.from.slice(0, 4) === r.to.slice(0, 4) ? short : full).format(asDate(r.from))} - ${full.format(asDate(r.to))}`
      : r.from
        ? `From ${full.format(asDate(r.from))}`
        : r.to
          ? `Up to ${full.format(asDate(r.to))}`
          : "";
  if (r.preset === "all" || !span) return "All time";
  if (r.preset === "custom") return span;
  return `${PRESETS.find((p) => p.key === r.preset)?.label} (${span})`;
}
