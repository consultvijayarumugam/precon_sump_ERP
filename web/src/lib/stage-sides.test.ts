import assert from "node:assert/strict";
import { test } from "node:test";
import { groupedStages, moveEffect, stageSide } from "./stage-sides.ts";
import type { PipelineStage } from "./stages.ts";

const s = (name: string, kind: PipelineStage["kind"], phase: PipelineStage["phase"], isActive = true): PipelineStage => ({
  id: name, key: name, name, kind, phase, isHandover: name === "Details Shared", position: 0, isActive,
});
// The live server's stages.
const STAGES = [
  s("New", "ENTRY", "NEW"),
  s("Interested", "MIDDLE", "CONTACTED"),
  s("Old step", "MIDDLE", "CONTACTED", false),
  s("Details Shared", "MIDDLE", "QUALIFIED"),
  s("Quote Shared", "MIDDLE", "QUOTED"),
  s("RNR", "MIDDLE", "QUOTED"),
  s("Won", "WON", "WON"),
  s("Lost", "LOST", "LOST"),
];

test("sides: before the handover, the handover and after (with Won), and Lost on its own", () => {
  assert.deepEqual(STAGES.map((x) => stageSide(x)), ["telecaller", "telecaller", "telecaller", "sales", "sales", "sales", "sales", "closed"]);
});

test("everyone is offered every active stage, grouped by side, in pipeline order", () => {
  const groups = groupedStages(STAGES, "Interested");
  assert.deepEqual(groups.map((g) => [g.label, g.stages.map((x) => x.name)]), [
    ["Telecaller side", ["New", "Interested"]],
    ["Sales side (after handover)", ["Details Shared", "Quote Shared", "RNR", "Won"]],
    ["Close", ["Lost"]],
  ]);
  // A switched-off stage shows only for a lead already in it.
  assert.ok(groupedStages(STAGES, "Old step")[0].stages.some((x) => x.name === "Old step"));
});

test("the warning before a move that changes who has the lead", () => {
  const telecallerLead = { ownerIsSales: false, handedOver: false };
  const handedOver = { ownerIsSales: true, handedOver: true };
  const walkIn = { ownerIsSales: true, handedOver: false };
  assert.equal(moveEffect(STAGES[4], telecallerLead), "handover"); // straight to Quote Shared
  assert.equal(moveEffect(STAGES[6], telecallerLead), "handover"); // Won
  assert.equal(moveEffect(STAGES[1], telecallerLead), "none");
  assert.equal(moveEffect(STAGES[7], telecallerLead), "none"); // Lost
  assert.equal(moveEffect(STAGES[1], handedOver), "return");
  assert.equal(moveEffect(STAGES[5], handedOver), "none");
  assert.equal(moveEffect(STAGES[1], walkIn), "none");
});
