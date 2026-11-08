import assert from "node:assert/strict";
import { test } from "node:test";
import { displayPhone, telNumber } from "./phone.ts";

test("Indian mobiles get +91 however they were typed", () => {
  for (const typed of ["9876543210", "98765 43210", "098765 43210", "+91 98765 43210", "91 98765 43210", "0091 98765 43210", "+91-98765-43210"]) {
    assert.equal(telNumber(typed), "+919876543210", typed);
  }
});

test("Indian landlines drop the trunk 0", () => {
  assert.equal(telNumber("0422 2345678"), "+914222345678");
});

test("other countries keep their code", () => {
  assert.equal(telNumber("+44 20 7946 0958"), "+442079460958");
});

test("short local numbers stay as digits; nothing to dial is null", () => {
  assert.equal(telNumber("1800"), "1800");
  assert.equal(telNumber("n/a"), null);
  assert.equal(telNumber(""), null);
});

test("displayPhone groups Indian numbers", () => {
  assert.equal(displayPhone("+919876543210"), "+91 98765 43210");
  assert.equal(displayPhone("+442079460958"), "+442079460958");
});
