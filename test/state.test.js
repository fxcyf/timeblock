import test from "node:test";
import assert from "node:assert/strict";

import { migrateAppState } from "../src/state.js";

test("migrates copied recurring blocks into V2 exceptions without duplicating instances", () => {
  const migrated = migrateAppState({
    rules: [{ id: "read", title: "阅读", start: 1200, duration: 30, days: [2], color: "blue", enabled: true }],
    eventContents: [{ id: "content-read", title: "阅读", favorite: true, color: "blue" }],
    blocksByDate: {
      "2026-08-25": [
        { id: "block-read", sourceRuleId: "read", title: "阅读", start: 1210, end: 1240, color: "blue", done: true },
        { id: "block-tea", title: "泡茶", start: 1260, end: 1275, color: "apricot", done: false },
      ],
    },
    viewDayCount: 3,
  }, "2026-08-29");

  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.blocksByDate["2026-08-25"].map((block) => block.id), ["block-tea"]);
  assert.equal(migrated.recurrenceExceptions[0].ruleId, "read");
  assert.equal(migrated.recurrenceExceptions[0].done, true);
  assert.equal(migrated.settings.viewDayCount, 3);
  assert.equal(migrated.settings.snapMinutes, 15);
});

test("migrates legacy favorite flags into three content states idempotently", () => {
  const legacy = {
    rules: [],
    recurrenceExceptions: [],
    blocksByDate: {},
    eventContents: [
      { id: "favorite", title: "阅读", favorite: true, color: "blue" },
      { id: "temporary", title: "泡茶", favorite: false, color: "apricot" },
      { id: "missing", title: "散步", color: "sage" },
      { id: "archived", title: "旧习惯", status: "archived", color: "lilac" },
    ],
    settings: { viewDayCount: 1, snapMinutes: 15 },
  };
  const migrated = migrateAppState(legacy, "2026-08-30");
  assert.deepEqual(migrated.eventContents.map((item) => item.status), ["favorite", "oneTime", "oneTime", "archived"]);
  assert.deepEqual(migrateAppState(migrated, "2026-08-30"), migrated);
});

test("preserves safe custom colors and falls back from invalid imported settings", () => {
  const migrated = migrateAppState({
    rules: [{ id: "r", title: "阅读", start: 600, duration: 30, days: [1], color: "#345f58" }],
    eventContents: [{ id: "c", title: "阅读", status: "favorite", color: "#a17c62" }],
    recurrenceExceptions: [],
    blocksByDate: { "2026-08-30": [{ id: "b", title: "阅读", start: 600, end: 630, color: "url(bad)" }] },
    settings: { viewDayCount: 1, snapMinutes: 15, accentColor: "not-a-color" },
  }, "2026-08-30");
  assert.equal(migrated.rules[0].color, "#345f58");
  assert.equal(migrated.eventContents[0].color, "#a17c62");
  assert.equal(migrated.blocksByDate["2026-08-30"][0].color, "apricot");
  assert.equal(migrated.settings.accentColor, "#486f65");
});
