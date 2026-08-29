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
