import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTalkTime } from "./workflow.ts";

test("talk-time reads naturally at each size", () => {
  assert.equal(formatTalkTime(0), "–");
  assert.equal(formatTalkTime(45), "45s");
  assert.equal(formatTalkTime(750), "12m 30s");
  assert.equal(formatTalkTime(11100), "3h 05m");
});
