const formatterCache = new Map();

function dateFromKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === dateKey ? date : null;
}

function addDateKeyDays(dateKey, amount) {
  const date = dateFromKey(dateKey);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function ruleOccursOnDate(rule, dateKey) {
  const date = dateFromKey(dateKey);
  if (!date || !Array.isArray(rule.days) || !rule.days.includes(date.getUTCDay())) return false;
  if (dateKey < (rule.startDate || "0000-01-01")) return false;
  if (rule.endDate && dateKey > rule.endDate) return false;
  if ((rule.inactiveRanges || []).some((range) => range.start <= dateKey && (!range.end || dateKey <= range.end))) return false;
  if (rule.enabled === false && !(rule.inactiveRanges || []).length) return false;
  return true;
}

function recurringForDate(state, dateKey) {
  const rules = Array.isArray(state?.rules) ? state.rules : [];
  const exceptions = Array.isArray(state?.recurrenceExceptions) ? state.recurrenceExceptions : [];
  return rules.flatMap((rule) => {
    const exception = exceptions.find((item) => item.ruleId === rule.id && item.date === dateKey);
    const movedHere = exceptions.filter((item) => item.ruleId === rule.id && item.date !== dateKey && item.movedToDate === dateKey && !item.cancelled);
    const sources = [];
    if (!exception?.cancelled && !exception?.movedToDate && (exception || ruleOccursOnDate(rule, dateKey))) {
      sources.push({ override: exception, recurrenceDate: dateKey });
    }
    sources.push(...movedHere.map((override) => ({ override, recurrenceDate: override.date })));
    return sources.map(({ override, recurrenceDate }) => ({
      id: `recurring-${rule.id}-${recurrenceDate}`,
      title: override?.title ?? rule.title,
      category: override && Object.hasOwn(override, "category") ? override.category : (rule.category || null),
      start: override?.start ?? rule.start,
      end: override?.end ?? rule.start + rule.duration,
      remindAtStart: override && Object.hasOwn(override, "remindAtStart") ? override.remindAtStart === true : rule.remindAtStart === true,
      remindAtEnd: override && Object.hasOwn(override, "remindAtEnd") ? override.remindAtEnd === true : rule.remindAtEnd === true,
      sourceRuleId: rule.id,
      recurrenceDate,
    }));
  });
}

function blocksForDate(state, dateKey) {
  const manual = Array.isArray(state?.blocksByDate?.[dateKey])
    ? state.blocksByDate[dateKey].filter((block) => !block.sourceRuleId && !block.recurring)
    : [];
  return [...manual, ...recurringForDate(state, dateKey)];
}

function formatMinute(minutes) {
  if (minutes === 24 * 60) return "24:00";
  const safe = Math.max(0, Math.min(24 * 60 - 1, Number(minutes) || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function reminderFor(block, dateKey, kind, clockDateKey, clockMinute) {
  const identity = block.sourceRuleId
    ? `${block.sourceRuleId}:${block.recurrenceDate || dateKey}`
    : String(block.id || `${block.start}-${block.end}-${block.title}`);
  return {
    eventKey: `${dateKey}:${identity}:${kind}:${clockDateKey}:${clockMinute}`,
    kind,
    title: String(block.title || "未命名安排"),
    category: block.category || null,
    timeRange: `${formatMinute(block.start)}–${formatMinute(block.end)}`,
    dateKey,
  };
}

export function remindersForLocalMinute(state, dateKey, minute) {
  const reminders = [];
  for (const block of blocksForDate(state, dateKey)) {
    if (block.remindAtStart === true && Number(block.start) === minute) reminders.push(reminderFor(block, dateKey, "start", dateKey, minute));
    if (block.remindAtEnd === true && Number(block.end) === minute) reminders.push(reminderFor(block, dateKey, "end", dateKey, minute));
  }
  if (minute === 0) {
    const previousDateKey = addDateKeyDays(dateKey, -1);
    for (const block of blocksForDate(state, previousDateKey)) {
      if (block.remindAtEnd === true && Number(block.end) === 24 * 60) reminders.push(reminderFor(block, previousDateKey, "end", dateKey, minute));
    }
  }
  return reminders;
}

function formatterFor(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }));
  }
  return formatterCache.get(timeZone);
}

export function localClockAt(instant, timeZone) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function localClocksInLookback(instant, timeZone, count = 3) {
  const clocks = [];
  const seen = new Set();
  const end = new Date(instant);
  end.setUTCSeconds(0, 0);
  for (let offset = 0; offset < Math.max(1, count); offset += 1) {
    const clock = localClockAt(new Date(end.getTime() - offset * 60_000), timeZone);
    const key = `${clock.dateKey}:${clock.minute}`;
    if (!seen.has(key)) {
      seen.add(key);
      clocks.push(clock);
    }
  }
  return clocks;
}
