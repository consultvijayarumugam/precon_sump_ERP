import assert from "node:assert/strict";
import { test } from "node:test";
import { pct, periodTiles, rupees, talk, type PeriodMetrics } from "./period-report.ts";

const totals: PeriodMetrics = {
  leadsIn: 40, callsLogged: 120, leadsCalled: 35, qualified: 10, conversionRate: 0.25, won: 4, lost: 2, winRate: 4 / 6,
  revenue: "125000.00", followUpsDue: 20, followUpsDone: 15, followUpCompliance: 0.75, phoneCalls: 90, connectedCalls: 60, talkSeconds: 3900, siteVisits: 6,
};
const labels = (tiles: { label: string }[]) => tiles.map((t) => t.label);

test("numbers read naturally", () => {
  assert.equal(pct(0.754), "75%");
  assert.equal(pct(null), "–");
  assert.equal(talk(3900), "1h 05m");
  assert.equal(talk(0), "–");
  assert.equal(rupees("125000.00"), "₹1,25,000");
});

test("admins see the team's figures, revenue only when operations are on", () => {
  const team = periodTiles({ scope: "team", kind: null, totals }, { showRevenue: true });
  assert.deepEqual(labels(team), ["New leads", "Calls logged", "Qualified for sales", "Won", "Revenue", "Follow-ups done on time", "Talk-time", "Site visits"]);
  assert.equal(team.find((t) => t.key === "qualified")?.hint, "25% of new leads");
  assert.ok(!labels(periodTiles({ scope: "team", kind: null, totals }, { showRevenue: false })).includes("Revenue"));
});

test("a telecaller sees calls and conversions; a salesperson sees wins and visits", () => {
  const tele = periodTiles({ scope: "self", kind: "telecaller", totals: { ...totals, revenue: null } }, { showRevenue: true });
  assert.deepEqual(labels(tele), ["Leads received", "Calls logged", "Qualified & handed over", "Won by sales", "Follow-ups done on time", "Talk-time"]);
  const sales = periodTiles({ scope: "self", kind: "sales", totals: { ...totals, qualified: null, conversionRate: null } }, { showRevenue: true });
  assert.deepEqual(labels(sales), ["Leads handed to me", "Won", "Revenue", "Follow-ups done on time", "Calls logged", "Talk-time", "Site visits"]);
  assert.equal(sales.find((t) => t.key === "followUps")?.hint, "15 of 20 due");
});
