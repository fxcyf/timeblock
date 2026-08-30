import test from "node:test";
import assert from "node:assert/strict";

import { gridCellAtPoint, gridSelectionRange, splitBlockIntoHourSegments } from "../src/grid.js";

test("maps pointer positions to 15-minute hour cells", () => {
  assert.equal(gridCellAtPoint({ x: 0, width: 400, hour: 9 }), 540);
  assert.equal(gridCellAtPoint({ x: 199, width: 400, hour: 9 }), 555);
  assert.equal(gridCellAtPoint({ x: 400, width: 400, hour: 23 }), 1425);
});

test("selects grid cells forward, backward, and at midnight boundaries", () => {
  assert.deepEqual(gridSelectionRange(555, 600), { start: 555, end: 615 });
  assert.deepEqual(gridSelectionRange(600, 555), { start: 555, end: 615 });
  assert.deepEqual(gridSelectionRange(1425, 1425), { start: 1425, end: 1440 });
});

test("splits cross-hour blocks into linked visual segments", () => {
  assert.deepEqual(splitBlockIntoHourSegments({ id: "focus", start: 585, end: 645 }), [
    { blockId: "focus", hour: 9, start: 45, end: 60, first: true, last: false },
    { blockId: "focus", hour: 10, start: 0, end: 45, first: false, last: true },
  ]);
});

test("keeps 15 and 30 minute events within one hour row", () => {
  assert.deepEqual(splitBlockIntoHourSegments({ id: "quarter", start: 600, end: 615 })[0], { blockId: "quarter", hour: 10, start: 0, end: 15, first: true, last: true });
  assert.equal(splitBlockIntoHourSegments({ id: "half", start: 615, end: 645 })[0].end - splitBlockIntoHourSegments({ id: "half", start: 615, end: 645 })[0].start, 30);
});
