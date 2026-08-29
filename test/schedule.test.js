import test from "node:test";
import assert from "node:assert/strict";

import {
  findNextFreeSlot,
  formatDuration,
  hasConflict,
  parseTime,
  selectionRange,
} from "../src/schedule.js";

test("parses and validates 24-hour times", () => {
  assert.equal(parseTime("19:30"), 1170);
  assert.equal(parseTime("24:00"), null);
  assert.equal(parseTime("晚饭"), null);
});

test("detects overlap while allowing adjacent blocks", () => {
  const blocks = [{ id: "meal", start: 1140, end: 1180 }];
  assert.equal(hasConflict({ start: 1160, end: 1200 }, blocks), true);
  assert.equal(hasConflict({ start: 1180, end: 1210 }, blocks), false);
});

test("finds the first free slot after existing blocks", () => {
  const blocks = [
    { start: 1110, end: 1150 },
    { start: 1180, end: 1210 },
  ];
  assert.deepEqual(findNextFreeSlot(blocks, 1110, 30, 1110, 1380), { start: 1150, end: 1180 });
  assert.equal(findNextFreeSlot(blocks, 1370, 30, 1110, 1380), null);
});

test("formats readable durations", () => {
  assert.equal(formatDuration(35), "35 分钟");
  assert.equal(formatDuration(90), "1 小时 30 分钟");
});

test("snaps a dragged timeline selection outward to 15-minute steps", () => {
  assert.deepEqual(selectionRange(19 * 60 + 7, 19 * 60 + 51, 1110, 1410), {
    start: 19 * 60,
    end: 20 * 60,
  });
  assert.deepEqual(selectionRange(20 * 60 + 52, 20 * 60 + 6, 1110, 1410), {
    start: 20 * 60,
    end: 21 * 60,
  });
  assert.deepEqual(selectionRange(21 * 60 + 15.02, 21 * 60 + 45.02, 1110, 1410), {
    start: 21 * 60 + 15,
    end: 21 * 60 + 45,
  });
});

test("turns a tap into a minimum selection and clamps it to the configured range", () => {
  assert.deepEqual(selectionRange(23 * 60 + 28, 23 * 60 + 28, 1110, 1410), {
    start: 23 * 60 + 15,
    end: 23 * 60 + 30,
  });
  assert.deepEqual(selectionRange(18 * 60, 18 * 60 + 20, 1110, 1410), {
    start: 18 * 60 + 30,
    end: 18 * 60 + 45,
  });
});

test("supports selections at both edges of a full 24-hour day", () => {
  assert.deepEqual(selectionRange(2, 22, 0, 24 * 60), { start: 0, end: 30 });
  assert.deepEqual(selectionRange(24 * 60 - 2, 24 * 60 - 2, 0, 24 * 60), {
    start: 24 * 60 - 15,
    end: 24 * 60,
  });
});
