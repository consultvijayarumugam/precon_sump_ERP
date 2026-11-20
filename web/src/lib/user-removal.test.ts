import assert from "node:assert/strict";
import { test } from "node:test";
import { blockedReason, dataLine, openLeadsLine, sortAssignees } from "./user-removal.ts";

test("open leads read as a count with their stages", () => {
  assert.equal(openLeadsLine({ openLeads: 0, openLeadsByStatus: {} }), "No open leads");
  assert.equal(openLeadsLine({ openLeads: 1, openLeadsByStatus: { QUOTED: 1 } }), "1 open lead (1 Quoted)");
  assert.equal(openLeadsLine({ openLeads: 3, openLeadsByStatus: { QUOTED: 1, NEW: 2 } }), "3 open leads (2 New, 1 Quoted)");
});

test("attached data reads as a short list; none means delete is safe", () => {
  assert.equal(dataLine([]), "No leads, calls, visits, follow-ups or history");
  assert.equal(
    dataLine([
      { key: "callLogs", label: "logged calls", count: 12 },
      { key: "assignedLeads", label: "leads assigned to them", count: 4 },
    ]),
    "12 logged calls, 4 leads assigned to them",
  );
  const many = ["a", "b", "c", "d", "e", "f"].map((k, i) => ({ key: k, label: k, count: 10 - i }));
  assert.equal(dataLine(many), "10 a, 9 b, 8 c, 7 d and 2 more kinds of record");
});

test("people in the same role are suggested first for the leads", () => {
  const person = (fullName: string, key: string) => ({ id: fullName, fullName, role: { key, name: key }, telecaller: key === "telecaller" });
  const sorted = sortAssignees({
    user: { id: "x", fullName: "Suresh", email: "", isActive: true, role: { key: "sales", name: "Sales" } },
    assignees: [person("Admin", "admin"), person("Tara", "telecaller"), person("Meena", "sales"), person("Arun", "sales")],
  });
  assert.deepEqual(sorted.map((a) => a.fullName), ["Arun", "Meena", "Admin", "Tara"]);
});

test("yourself and the last admin can't be removed", () => {
  assert.match(blockedReason({ isSelf: true, lastAdmin: false })!, /yourself/);
  assert.match(blockedReason({ isSelf: false, lastAdmin: true })!, /^At least one admin is required/);
  assert.equal(blockedReason({ isSelf: false, lastAdmin: false }), null);
});
