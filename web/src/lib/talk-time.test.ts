import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTalkTime, phoneCallResult } from "./workflow.ts";

test("talk-time reads naturally at each size", () => {
  assert.equal(formatTalkTime(0), "–");
  assert.equal(formatTalkTime(45), "45s");
  assert.equal(formatTalkTime(750), "12m 30s");
  assert.equal(formatTalkTime(11100), "3h 05m");
});

test("phone calls on the lead page say how they went", () => {
  assert.equal(phoneCallResult({ direction: "INCOMING", durationSeconds: 192 }), "3m 12s talk");
  assert.equal(phoneCallResult({ direction: "OUTGOING", durationSeconds: 0 }), "Not answered");
  assert.equal(phoneCallResult({ direction: "MISSED", durationSeconds: 0 }), "Not picked up");
  assert.equal(phoneCallResult({ direction: "REJECTED", durationSeconds: 0 }), "Declined");
});
