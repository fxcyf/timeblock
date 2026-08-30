import test from "node:test";
import assert from "node:assert/strict";

import { planGroupTransform } from "../src/group.js";

const selected = [
  { date: "2026-08-30", block: { id: "a", title: "A", start: 540, end: 600, color: "sage", done: true } },
  { date: "2026-08-30", block: { id: "b", title: "B", start: 600, end: 630, color: "blue", done: false } },
  { date: "2026-08-31", block: { id: "r", title: "R", start: 570, end: 600, color: "lilac", recurring: true, sourceRuleId: "rule", recurrenceDate: "2026-08-31" } },
];

test("moves a cross-date group atomically while allowing selected positions to be reused", () => {
  const plan = planGroupTransform({
    items: selected,
    targetDate: "2026-09-01",
    targetStart: 600,
    mode: "move",
    existingByDate: {
      "2026-08-30": selected.slice(0, 2).map((item) => item.block),
      "2026-08-31": [selected[2].block],
    },
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.candidates.map((item) => [item.targetDate, item.block.start]), [["2026-09-01", 600], ["2026-09-01", 660], ["2026-09-02", 630]]);
});

test("copies with new IDs, resets completion, and detaches recurring instances", () => {
  const plan = planGroupTransform({ items: selected, targetDate: "2026-09-01", targetStart: 600, mode: "copy", existingByDate: {}, createId: (_, index) => `copy-${index}` });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.candidates.map((item) => item.block.id), ["copy-0", "copy-1", "copy-2"]);
  assert.ok(plan.candidates.every((item) => item.block.done === false && !item.block.recurring && !item.block.sourceRuleId));
});

test("rejects the whole group on boundaries or external conflicts", () => {
  const conflict = planGroupTransform({ items: selected.slice(0, 2), targetDate: "2026-09-01", targetStart: 600, mode: "copy", existingByDate: { "2026-09-01": [{ id: "outside", start: 620, end: 680 }] } });
  assert.equal(conflict.ok, false);
  assert.ok(conflict.conflicts.length > 0);
  const boundary = planGroupTransform({ items: selected.slice(0, 2), targetDate: "2026-09-01", targetStart: 1400, mode: "move", existingByDate: {} });
  assert.equal(boundary.ok, false);
});
