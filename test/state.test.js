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
  assert.equal(Object.hasOwn(migrated.recurrenceExceptions[0], "done"), false);
  assert.equal(Object.hasOwn(migrated.blocksByDate["2026-08-25"][0], "done"), false);
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
  assert.equal(migrated.rules[0].fallbackColor, "#345f58");
  assert.equal(migrated.eventContents[0].color, "#a17c62");
  assert.equal(migrated.blocksByDate["2026-08-30"][0].fallbackColor, "apricot");
  assert.equal(migrated.settings.accentColor, "#a8d2cc");
});

test("migrates block and rule colors into linked content fallbacks", () => {
  const migrated = migrateAppState({
    rules: [{ id: "rule-read", title: "阅读", category: "兴趣", start: 600, duration: 30, days: [1], color: "blue" }],
    eventContents: [{ id: "content-read", title: "阅读", category: "兴趣", status: "favorite", color: "blue" }],
    recurrenceExceptions: [],
    blocksByDate: { "2026-08-30": [{ id: "block-read", title: "阅读", category: "兴趣", start: 600, end: 630, color: "blue" }] },
  }, "2026-08-30");

  assert.equal(migrated.rules[0].contentId, "content-read");
  assert.equal(migrated.rules[0].fallbackColor, "blue");
  assert.equal(Object.hasOwn(migrated.rules[0], "color"), false);
  assert.equal(migrated.blocksByDate["2026-08-30"][0].contentId, "content-read");
  assert.equal(migrated.blocksByDate["2026-08-30"][0].fallbackColor, "blue");
  assert.equal(Object.hasOwn(migrated.blocksByDate["2026-08-30"][0], "color"), false);
});

test("creates hidden one-time content for legacy blocks without a reusable match", () => {
  const migrated = migrateAppState({
    rules: [],
    eventContents: [],
    recurrenceExceptions: [],
    blocksByDate: { "2026-08-30": [{ id: "block-tea", title: "泡茶", category: "休息", start: 600, end: 615, color: "rose" }] },
  }, "2026-08-30");

  const [block] = migrated.blocksByDate["2026-08-30"];
  const content = migrated.eventContents.find((item) => item.id === block.contentId);
  assert.equal(content.status, "oneTime");
  assert.equal(content.color, "rose");
  assert.equal(block.fallbackColor, "rose");
  assert.deepEqual(migrateAppState(migrated, "2026-08-30"), migrated);
});

test("defaults old schedules to silent and preserves event-level reminder choices", () => {
  const migrated = migrateAppState({
    rules: [
      { id: "silent-rule", title: "旧规则", start: 600, duration: 30, days: [1] },
      { id: "alert-rule", title: "提醒规则", start: 660, duration: 30, days: [1], remindAtStart: true, remindAtEnd: false },
    ],
    eventContents: [],
    recurrenceExceptions: [
      { id: "exception", ruleId: "alert-rule", date: "2026-08-31", title: "单次改动", start: 670, end: 700, remindAtStart: false, remindAtEnd: true, cancelled: false },
    ],
    blocksByDate: {
      "2026-08-30": [
        { id: "old", title: "旧安排", start: 600, end: 630 },
        { id: "alert", title: "提醒安排", start: 660, end: 690, remindAtStart: true },
      ],
    },
  }, "2026-08-30");

  assert.deepEqual(migrated.rules.map((rule) => [rule.remindAtStart, rule.remindAtEnd]), [[false, false], [true, false]]);
  assert.deepEqual(migrated.blocksByDate["2026-08-30"].map((block) => [block.remindAtStart, block.remindAtEnd]), [[false, false], [true, false]]);
  assert.equal(migrated.recurrenceExceptions[0].remindAtStart, false);
  assert.equal(migrated.recurrenceExceptions[0].remindAtEnd, true);
});
