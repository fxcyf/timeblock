import test from "node:test";
import assert from "node:assert/strict";

import { createBackup, parseBackup } from "../src/backup.js";

const state = {
  schemaVersion: 2,
  settings: { viewDayCount: 3, snapMinutes: 15, accentColor: "#486f65" },
  rules: [{ id: "dinner", title: "晚餐", category: "用餐", start: 1140, duration: 45, days: [1, 2, 3], startDate: "2026-01-01", endDate: null, color: "apricot", enabled: true, inactiveRanges: [] }],
  recurrenceExceptions: [{ id: "exception-dinner-2026-08-28", ruleId: "dinner", date: "2026-08-28", title: "晚餐", category: "用餐", start: 1150, end: 1195, color: "apricot", done: true, cancelled: false }],
  eventContents: [{ id: "content-dinner", title: "晚餐", category: "用餐", status: "favorite", color: "#b96d4e", sortOrder: 0 }],
  blocksByDate: {
    "2026-08-28": [{ id: "block-dinner", contentId: "content-dinner", title: "晚餐", category: "用餐", start: 1140, end: 1185, color: "apricot", done: false }],
  },
};

test("exports a versioned backup and restores the complete state", () => {
  const backup = createBackup(state, "2026-08-28T12:00:00.000Z");
  assert.equal(backup.format, "timeblock-backup");
  assert.equal(backup.version, 3);
  assert.equal(backup.exportedAt, "2026-08-28T12:00:00.000Z");
  assert.deepEqual(parseBackup(JSON.stringify(backup)), state);
});

test("accepts a raw localStorage state for manual migration", () => {
  assert.deepEqual(parseBackup(JSON.stringify(state)), state);
});

test("imports a V1 backup and migrates copied recurring instances", () => {
  const legacyState = {
    rules: [{ id: "dinner", title: "晚餐", start: 1140, duration: 45, days: [5], color: "apricot", enabled: true }],
    eventContents: [{ id: "content-dinner", title: "晚餐", category: null, favorite: true, color: "apricot" }],
    blocksByDate: { "2026-08-28": [{ id: "legacy", sourceRuleId: "dinner", title: "晚餐", start: 1150, end: 1195, color: "apricot", done: true }] },
    viewDayCount: 7,
  };
  const migrated = parseBackup(JSON.stringify({ format: "timeblock-backup", version: 1, exportedAt: "2026-08-29T00:00:00.000Z", state: legacyState }));
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.settings.viewDayCount, 7);
  assert.equal(migrated.blocksByDate["2026-08-28"].length, 0);
  assert.equal(migrated.recurrenceExceptions[0].done, true);
});

test("imports a V2 backup with legacy favorite flags", () => {
  const legacyV2 = {
    ...state,
    settings: { viewDayCount: 1, snapMinutes: 15 },
    eventContents: [{ id: "old", title: "旧常用", favorite: true, color: "sage" }],
  };
  const migrated = parseBackup(JSON.stringify({ format: "timeblock-backup", version: 2, state: legacyV2 }));
  assert.equal(migrated.eventContents[0].status, "favorite");
  assert.equal(migrated.settings.accentColor, "#486f65");
});

test("accepts the original single-day localStorage shape", () => {
  const migrated = parseBackup(JSON.stringify({
    date: "2026-08-28",
    blocks: [{ id: "tea", title: "泡茶", start: 600, end: 615, color: "apricot", done: false }],
    rules: [],
    eventContents: [],
    viewDayCount: 1,
  }));
  assert.equal(migrated.blocksByDate["2026-08-28"][0].title, "泡茶");
});

test("rejects malformed structures and safely falls back from invalid colors", () => {
  assert.throws(() => parseBackup("not json"), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, blocksByDate: [] })), /日期数据/);
  assert.equal(parseBackup(JSON.stringify({ ...state, eventContents: [{ ...state.eventContents[0], color: "url(bad)" }] })).eventContents[0].color, "apricot");
  assert.throws(() => parseBackup(JSON.stringify({ format: "timeblock-backup", version: 4, state })), /版本/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, schemaVersion: 3 })), /版本/);
});

test("round-trips archived content, accent colors, and moved recurring exceptions", () => {
  const custom = {
    ...state,
    settings: { ...state.settings, accentColor: "#315f57" },
    eventContents: [{ ...state.eventContents[0], status: "archived" }],
    recurrenceExceptions: [{ ...state.recurrenceExceptions[0], movedToDate: "2026-08-29" }],
  };
  assert.deepEqual(parseBackup(JSON.stringify(createBackup(custom))), custom);
});
