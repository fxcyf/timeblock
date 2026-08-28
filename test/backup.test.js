import test from "node:test";
import assert from "node:assert/strict";

import { createBackup, parseBackup } from "../src/backup.js";

const state = {
  rules: [{ id: "dinner", title: "晚餐", start: 1140, duration: 45, days: [1, 2, 3], color: "apricot", enabled: true }],
  eventContents: [{ id: "content-dinner", title: "晚餐", category: "用餐", favorite: true, color: "apricot" }],
  blocksByDate: {
    "2026-08-28": [{ id: "block-dinner", contentId: "content-dinner", title: "晚餐", category: "用餐", start: 1140, end: 1185, color: "apricot", done: false }],
  },
  viewDayCount: 3,
};

test("exports a versioned backup and restores the complete state", () => {
  const backup = createBackup(state, "2026-08-28T12:00:00.000Z");
  assert.equal(backup.format, "timeblock-backup");
  assert.equal(backup.version, 1);
  assert.equal(backup.exportedAt, "2026-08-28T12:00:00.000Z");
  assert.deepEqual(parseBackup(JSON.stringify(backup)), state);
});

test("accepts a raw localStorage state for manual migration", () => {
  assert.deepEqual(parseBackup(JSON.stringify(state)), state);
});

test("rejects malformed or unsafe backup data", () => {
  assert.throws(() => parseBackup("not json"), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, blocksByDate: [] })), /日期数据/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, eventContents: [{ ...state.eventContents[0], color: "url(bad)" }] })), /颜色/);
  assert.throws(() => parseBackup(JSON.stringify({ format: "timeblock-backup", version: 2, state })), /版本/);
});
