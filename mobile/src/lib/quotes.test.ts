import assert from "node:assert/strict";
import { test } from "node:test";
import { indiaDayNumber, QUOTES, quoteOfTheDay } from "./quotes.ts";

test("there are about 30 distinct, non-empty quotes", () => {
  assert.equal(QUOTES.length, 30);
  assert.equal(new Set(QUOTES.map((q) => q.text)).size, QUOTES.length);
  for (const q of QUOTES) assert.ok(q.text.trim().length > 0);
});

test("everyone gets the same quote all day, by India time", () => {
  // 17 Nov 2026 in India runs from 16 Nov 18:30 UTC to 17 Nov 18:29 UTC.
  const startOfDay = quoteOfTheDay(new Date("2026-11-16T18:30:00Z"));
  assert.deepEqual(quoteOfTheDay(new Date("2026-11-17T06:00:00Z")), startOfDay);
  assert.deepEqual(quoteOfTheDay(new Date("2026-11-17T18:29:59Z")), startOfDay);
  // Midnight India time moves to the next quote.
  assert.notDeepEqual(quoteOfTheDay(new Date("2026-11-17T18:30:00Z")), startOfDay);
});

test("consecutive days step through the list and wrap around", () => {
  const day0 = new Date("2026-11-17T06:00:00Z");
  const n = indiaDayNumber(day0);
  for (let i = 0; i < QUOTES.length * 2; i++) {
    const at = new Date(day0.getTime() + i * 86_400_000);
    assert.equal(indiaDayNumber(at), n + i);
    assert.equal(quoteOfTheDay(at), QUOTES[(n + i) % QUOTES.length]);
  }
});
