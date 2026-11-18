import assert from "node:assert/strict";
import { test } from "node:test";
import { presetRange, rangeFromParams, rangeLabel } from "./date-range.ts";

const now = new Date(2026, 10, 18, 15, 0); // Wed 18 Nov 2026

test("presets cover the right days (weeks start Monday)", () => {
  assert.deepEqual(presetRange("today", now), { preset: "today", from: "2026-11-18", to: "2026-11-18" });
  assert.deepEqual(presetRange("week", now), { preset: "week", from: "2026-11-16", to: "2026-11-22" });
  assert.deepEqual(presetRange("month", now), { preset: "month", from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(presetRange("lastMonth", now), { preset: "lastMonth", from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(presetRange("lastMonth", new Date(2027, 0, 5)), { preset: "lastMonth", from: "2026-12-01", to: "2026-12-31" });
  assert.deepEqual(presetRange("all", now), { preset: "all" });
});

test("a range in the URL comes back as the same range", () => {
  assert.deepEqual(rangeFromParams("custom", "2026-09-01", "2026-09-30"), { preset: "custom", from: "2026-09-01", to: "2026-09-30" });
  assert.equal(rangeFromParams("month", null, null).preset, "month");
  assert.equal(rangeFromParams(null, null, null).preset, "all");
  assert.equal(rangeFromParams("nonsense", null, null, presetRange("month", now)).preset, "month");
});

test("labels read naturally", () => {
  assert.equal(rangeLabel({ preset: "custom", from: "2026-09-01", to: "2026-09-30" }), "1 Sept - 30 Sept 2026".replace(/Sept/g, new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(2026, 8, 1))));
  assert.equal(rangeLabel({ preset: "all" }), "All time");
});
