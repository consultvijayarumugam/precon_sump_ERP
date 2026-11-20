// Admin -> Users: wording for the Remove dialog (GET /users/:id/removal).

export interface RemovalCheck {
  user: { id: string; fullName: string; email: string; isActive: boolean; role: { key: string; name: string } };
  isSelf: boolean;
  lastAdmin: boolean;
  openLeads: number;
  openLeadsByStatus: Partial<Record<"NEW" | "CONTACTED" | "QUALIFIED" | "QUOTED", number>>;
  data: { key: string; label: string; count: number }[];
  canDeactivate: boolean;
  canDelete: boolean;
  assignees: { id: string; fullName: string; role: { key: string; name: string }; telecaller: boolean }[];
}

export interface UserAuditEvent {
  id: string;
  action: "CREATED" | "ROLE_CHANGED" | "DEACTIVATED" | "REACTIVATED" | "LEADS_REASSIGNED" | "DELETED";
  message: string;
  actorName: string;
  createdAt: string;
  targetName?: string;
}

const PHASE_WORDS = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Handed to sales", QUOTED: "Quoted" } as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "3 open leads (2 New, 1 Quoted)" */
export function openLeadsLine(check: Pick<RemovalCheck, "openLeads" | "openLeadsByStatus">) {
  if (check.openLeads === 0) return "No open leads";
  const parts = (Object.keys(PHASE_WORDS) as (keyof typeof PHASE_WORDS)[])
    .filter((s) => check.openLeadsByStatus[s])
    .map((s) => `${check.openLeadsByStatus[s]} ${PHASE_WORDS[s]}`);
  return `${plural(check.openLeads, "open lead")} (${parts.join(", ")})`;
}

/** "12 logged calls, 4 leads assigned to them and 2 more kinds of record" */
export function dataLine(data: RemovalCheck["data"], shown = 4) {
  if (data.length === 0) return "No leads, calls, visits, follow-ups or history";
  const lines = data.slice(0, shown).map((d) => `${d.count} ${d.label}`);
  const rest = data.length - shown;
  return rest > 0 ? `${lines.join(", ")} and ${plural(rest, "more kind")} of record` : lines.join(", ");
}

/** Who to suggest first for the leads: the same kind of person (telecaller for a telecaller, sales for sales), then everyone else. */
export function sortAssignees(check: Pick<RemovalCheck, "assignees" | "user">) {
  const same = (a: RemovalCheck["assignees"][number]) => a.role.key === check.user.role.key;
  return [...check.assignees].sort((a, b) => Number(same(b)) - Number(same(a)) || a.fullName.localeCompare(b.fullName));
}

/** Why the Remove dialog can't act at all, or null when it can. */
export function blockedReason(check: Pick<RemovalCheck, "isSelf" | "lastAdmin">) {
  if (check.isSelf) return "You can't remove yourself. Ask another admin.";
  if (check.lastAdmin) return "At least one admin is required. Make someone else an admin first, then you can remove this one.";
  return null;
}
