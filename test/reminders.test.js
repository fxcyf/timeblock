import test from "node:test";
import assert from "node:assert/strict";

import {
  localClockAt,
  localClocksInLookback,
  remindersForLocalMinute,
} from "../supabase/functions/_shared/reminders.js";

function stateWith(values = {}) {
  return {
    blocksByDate: {},
    rules: [],
    recurrenceExceptions: [],
    eventContents: [],
    ...values,
  };
}

test("sends only the start and end reminders selected on each manual block", () => {
  const state = stateWith({
    blocksByDate: {
      "2026-10-01": [
        { id: "silent", title: "不提醒", start: 9 * 60, end: 10 * 60 },
        { id: "focus", title: "专注工作", category: "工作", start: 9 * 60, end: 10 * 60, remindAtStart: true, remindAtEnd: false },
        { id: "break", title: "休息", start: 9 * 60, end: 10 * 60, remindAtStart: false, remindAtEnd: true },
      ],
    },
  });

  const starts = remindersForLocalMinute(state, "2026-10-01", 9 * 60);
  const ends = remindersForLocalMinute(state, "2026-10-01", 10 * 60);
  assert.deepEqual(starts.map(({ kind, title, timeRange }) => ({ kind, title, timeRange })), [
    { kind: "start", title: "专注工作", timeRange: "09:00–10:00" },
  ]);
  assert.deepEqual(ends.map(({ kind, title }) => ({ kind, title })), [{ kind: "end", title: "休息" }]);
  assert.notEqual(starts[0].eventKey, ends[0].eventKey);
});

test("catches a selected 24:00 ending after midnight", () => {
  const state = stateWith({
    blocksByDate: {
      "2026-10-01": [{ id: "late", title: "收尾", start: 23 * 60, end: 24 * 60, remindAtEnd: true }],
    },
  });

  assert.equal(remindersForLocalMinute(state, "2026-10-01", 23 * 60).length, 0);
  const reminders = remindersForLocalMinute(state, "2026-10-02", 0);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].kind, "end");
  assert.equal(reminders[0].dateKey, "2026-10-01");
});

test("materializes recurring moves and cancellations without duplicate reminders", () => {
  const rule = {
    id: "routine",
    title: "例行安排",
    start: 9 * 60,
    duration: 60,
    days: [4, 5],
    startDate: "2026-10-01",
    endDate: null,
    enabled: true,
    inactiveRanges: [],
    remindAtStart: true,
    remindAtEnd: false,
  };
  const state = stateWith({
    rules: [rule],
    recurrenceExceptions: [
      { ruleId: "routine", date: "2026-10-01", movedToDate: "2026-10-02", title: "改期安排", start: 11 * 60, end: 12 * 60, remindAtStart: false, remindAtEnd: true, cancelled: false },
      { ruleId: "routine", date: "2026-10-02", cancelled: true },
    ],
  });

  assert.equal(remindersForLocalMinute(state, "2026-10-01", 9 * 60).length, 0);
  assert.equal(remindersForLocalMinute(state, "2026-10-02", 9 * 60).length, 0);
  assert.equal(remindersForLocalMinute(state, "2026-10-02", 11 * 60).length, 0);
  const moved = remindersForLocalMinute(state, "2026-10-02", 12 * 60);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].title, "改期安排");
  assert.equal(moved[0].kind, "end");
  assert.match(moved[0].eventKey, /routine.*2026-10-01.*end/);

  const inherited = remindersForLocalMinute(state, "2026-10-08", 9 * 60);
  assert.equal(inherited.length, 1);
  assert.equal(inherited[0].kind, "start");
});

test("converts UTC instants to subscription-local minute clocks with lookback", () => {
  assert.deepEqual(localClockAt(new Date("2026-10-01T16:00:30.000Z"), "Asia/Shanghai"), {
    dateKey: "2026-10-02",
    minute: 0,
  });
  assert.deepEqual(localClockAt(new Date("2026-10-01T16:00:30.000Z"), "America/Los_Angeles"), {
    dateKey: "2026-10-01",
    minute: 9 * 60,
  });
  assert.deepEqual(localClocksInLookback(new Date("2026-10-01T16:01:30.000Z"), "Asia/Shanghai", 3), [
    { dateKey: "2026-10-02", minute: 1 },
    { dateKey: "2026-10-02", minute: 0 },
    { dateKey: "2026-10-01", minute: 23 * 60 + 59 },
  ]);
});
