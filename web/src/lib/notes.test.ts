import assert from "node:assert/strict";
import { test } from "node:test";
import { sharedWith } from "./notes.ts";

test("notes say who shares them: telecaller and salesperson", () => {
  assert.equal(
    sharedWith({ telecaller: { fullName: "Tara" }, assignedTo: { fullName: "Suresh" }, qualifiedAt: "2026-11-01" }),
    "Seen by Tara (telecaller), Suresh (sales) and admins.",
  );
  // Before handover the telecaller is also the assignee: named once.
  assert.equal(sharedWith({ telecaller: { fullName: "Tara" }, assignedTo: { fullName: "Tara" }, qualifiedAt: null }), "Seen by Tara (telecaller) and admins.");
  assert.equal(sharedWith({ telecaller: null, assignedTo: null, qualifiedAt: null }), "Seen by everyone working this lead, and admins.");
});
