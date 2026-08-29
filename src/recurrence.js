import { addDateKeyDays, dateFromKey } from "./calendar.js";

function isInactive(rule, dateKey) {
  return (rule.inactiveRanges || []).some((range) => (
    range.start <= dateKey && (!range.end || dateKey <= range.end)
  ));
}

export function ruleOccursOnDate(rule, dateKey) {
  const date = dateFromKey(dateKey);
  if (!date || !Array.isArray(rule.days) || !rule.days.includes(date.getUTCDay())) return false;
  if (dateKey < (rule.startDate || "0000-01-01")) return false;
  if (rule.endDate && dateKey > rule.endDate) return false;
  if (isInactive(rule, dateKey)) return false;
  if (rule.enabled === false && !(rule.inactiveRanges || []).length) return false;
  return true;
}

export function recurringInstanceId(ruleId, dateKey) {
  return `recurring-${ruleId}-${dateKey}`;
}

export function exceptionId(ruleId, dateKey) {
  return `exception-${ruleId}-${dateKey}`;
}

export function materializeRecurringForDate(rules, exceptions, dateKey) {
  return rules.flatMap((rule) => {
    const exception = exceptions.find((item) => item.ruleId === rule.id && item.date === dateKey);
    if (exception?.cancelled) return [];
    if (!exception && !ruleOccursOnDate(rule, dateKey)) return [];
    return [{
      id: recurringInstanceId(rule.id, dateKey),
      title: exception?.title ?? rule.title,
      category: exception && Object.hasOwn(exception, "category") ? exception.category : (rule.category || null),
      start: exception?.start ?? rule.start,
      end: exception?.end ?? rule.start + rule.duration,
      color: exception?.color ?? rule.color ?? "sage",
      done: exception?.done === true,
      sourceRuleId: rule.id,
      recurrenceDate: dateKey,
      recurring: true,
    }];
  });
}

export function upsertRecurrenceException(exceptions, rule, dateKey, changes = {}) {
  const current = exceptions.find((item) => item.ruleId === rule.id && item.date === dateKey);
  const next = {
    id: current?.id || exceptionId(rule.id, dateKey),
    ruleId: rule.id,
    date: dateKey,
    title: changes.title ?? current?.title ?? rule.title,
    category: Object.hasOwn(changes, "category") ? changes.category : (current?.category ?? rule.category ?? null),
    start: changes.start ?? current?.start ?? rule.start,
    end: changes.end ?? current?.end ?? rule.start + rule.duration,
    color: changes.color ?? current?.color ?? rule.color ?? "sage",
    done: changes.done ?? current?.done ?? false,
    cancelled: changes.cancelled === true,
  };
  return [...exceptions.filter((item) => !(item.ruleId === rule.id && item.date === dateKey)), next];
}

export function splitRecurringRule(rule, dateKey, changes) {
  const previousEnd = addDateKeyDays(dateKey, -1);
  const previousRule = rule.startDate && rule.startDate >= dateKey ? null : { ...rule, endDate: previousEnd };
  const nextRule = {
    ...rule,
    ...changes,
    id: changes.id,
    startDate: dateKey,
    endDate: rule.endDate && rule.endDate < dateKey ? dateKey : rule.endDate,
    enabled: true,
    inactiveRanges: [],
  };
  return { previousRule, nextRule };
}

export function rulesConflictInRange(left, right) {
  const sharedDays = left.days.filter((day) => right.days.includes(day));
  if (!sharedDays.length || left.start >= right.start + right.duration || left.start + left.duration <= right.start) return false;
  const rangeStart = [left.startDate || "2000-01-01", right.startDate || "2000-01-01"].sort().at(-1);
  const finiteEnds = [left.endDate, right.endDate].filter(Boolean).sort();
  const rangeEnd = finiteEnds[0] || addDateKeyDays(rangeStart, 6);
  if (rangeEnd < rangeStart) return false;
  const lastDate = [rangeEnd, addDateKeyDays(rangeStart, 6)].sort()[0];
  for (let dateKey = rangeStart; dateKey <= lastDate; dateKey = addDateKeyDays(dateKey, 1)) {
    if (sharedDays.includes(dateFromKey(dateKey).getUTCDay())) return true;
  }
  return false;
}
