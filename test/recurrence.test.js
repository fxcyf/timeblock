import test from "node:test";
import assert from "node:assert/strict";

import {
  materializeRecurringForDate,
  rulesConflictInRange,
  splitRecurringRule,
  upsertRecurrenceException,
} from "../src/recurrence.js";

const rule = {
  id: "workout",
  title: "训练",
  category: "健康",
  start: 1200,
  duration: 60,
  days: [2, 4],
  startDate: "2026-08-01",
  endDate: null,
  color: "sage",
  enabled: true,
  inactiveRanges: [],
};

test("derives recurring instances from rules and their active date range", () => {
  assert.equal(materializeRecurringForDate([rule], [], "2026-08-25").length, 1);
  assert.equal(materializeRecurringForDate([rule], [], "2026-08-26").length, 0);
  assert.equal(materializeRecurringForDate([{ ...rule, startDate: "2026-08-26" }], [], "2026-08-25").length, 0);
  assert.equal(materializeRecurringForDate([{ ...rule, endDate: "2026-08-24" }], [], "2026-08-25").length, 0);
});

test("stores one-date edits, completion, and cancellation as exceptions", () => {
  let exceptions = upsertRecurrenceException([], rule, "2026-08-25", {
    title: "晚一点训练",
    start: 1260,
    end: 1320,
    done: true,
  });
  let [instance] = materializeRecurringForDate([rule], exceptions, "2026-08-25");
  assert.equal(instance.title, "晚一点训练");
  assert.equal(instance.start, 1260);
  assert.equal(instance.done, true);

  exceptions = upsertRecurrenceException(exceptions, rule, "2026-08-25", { cancelled: true });
  assert.deepEqual(materializeRecurringForDate([rule], exceptions, "2026-08-25"), []);
});

test("keeps a materialized historical exception visible while its rule is paused", () => {
  const pausedRule = { ...rule, enabled: false, inactiveRanges: [] };
  const exceptions = upsertRecurrenceException([], rule, "2026-08-25", { done: true });
  assert.equal(materializeRecurringForDate([pausedRule], exceptions, "2026-08-25")[0].done, true);
  assert.deepEqual(materializeRecurringForDate([pausedRule], exceptions, "2026-08-27"), []);
});

test("splits a recurring rule for this occurrence and all future dates", () => {
  const { previousRule, nextRule } = splitRecurringRule(rule, "2026-08-25", {
    id: "workout-next",
    title: "晨练",
    start: 420,
    duration: 45,
  });
  assert.equal(previousRule.endDate, "2026-08-24");
  assert.equal(nextRule.startDate, "2026-08-25");
  assert.equal(nextRule.title, "晨练");
  assert.equal(nextRule.start, 420);
});

test("only rejects overlapping rules when weekdays and effective ranges overlap", () => {
  const overlapping = { ...rule, id: "walk", start: 1230, duration: 30 };
  assert.equal(rulesConflictInRange(rule, overlapping), true);
  assert.equal(rulesConflictInRange(rule, { ...overlapping, days: [1, 3, 5] }), false);
  assert.equal(rulesConflictInRange(rule, { ...overlapping, startDate: "2027-01-01", endDate: "2027-02-01" }), true);
  assert.equal(rulesConflictInRange({ ...rule, endDate: "2026-08-31" }, { ...overlapping, startDate: "2026-09-01" }), false);
  assert.equal(rulesConflictInRange(
    { ...rule, days: [2], startDate: "2026-08-26", endDate: "2026-08-27" },
    { ...overlapping, days: [2], startDate: "2026-08-26", endDate: "2026-08-27" },
  ), false);
});
