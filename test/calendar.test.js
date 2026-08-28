import test from "node:test";
import assert from "node:assert/strict";

import { addDateKeyDays, migrateBlocksByDate, visibleDateKeys } from "../src/calendar.js";

test("moves date keys across month and year boundaries", () => {
  assert.equal(addDateKeyDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDateKeyDays("2028-03-01", -1), "2028-02-29");
});

test("builds one-day, three-day, and Monday-based week ranges", () => {
  assert.deepEqual(visibleDateKeys("2026-08-28", 1), ["2026-08-28"]);
  assert.deepEqual(visibleDateKeys("2026-08-28", 3), ["2026-08-28", "2026-08-29", "2026-08-30"]);
  assert.deepEqual(visibleDateKeys("2026-08-28", 7), [
    "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30",
  ]);
});

test("migrates the previous single-day block state", () => {
  const blocks = [{ id: "legacy", start: 1140, end: 1180 }];
  assert.deepEqual(migrateBlocksByDate({ date: "2026-08-28", blocks }), { "2026-08-28": blocks });
  assert.deepEqual(migrateBlocksByDate({ blocksByDate: { "2026-08-28": blocks, broken: null } }), { "2026-08-28": blocks });
});
