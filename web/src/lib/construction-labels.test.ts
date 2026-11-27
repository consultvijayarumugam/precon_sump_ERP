import assert from "node:assert/strict";
import { test } from "node:test";
import { constructionLabel, NOT_KNOWN, pickableConstruction } from "./construction-labels.ts";

test('a lead with no construction stage reads "Not known"', () => {
  assert.equal(NOT_KNOWN, "Not known");
  assert.equal(constructionLabel(null), "Not known");
  assert.equal(constructionLabel(undefined), "Not known");
  assert.equal(constructionLabel({ id: "f", name: "Foundation" }), "Foundation");
});

test("the picker offers switched-on stages, plus the lead's own even if switched off", () => {
  const stages = [
    { id: "p", isActive: true, name: "Planning" },
    { id: "r", isActive: false, name: "Roof" },
    { id: "f", isActive: true, name: "Foundation" },
  ];
  assert.deepEqual(pickableConstruction(stages, null).map((s) => s.id), ["p", "f"]);
  assert.deepEqual(pickableConstruction(stages, "r").map((s) => s.id), ["p", "r", "f"]);
  assert.deepEqual(pickableConstruction(null, null), []);
});
