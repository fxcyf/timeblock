const TIME_PATTERN = /(?:^|\s)([01]?\d|2[0-3])[:：]([0-5]\d)(?=\s|$)/;
const DURATION_PATTERN = /(\d+)\s*(?:分钟|min(?:ute)?s?|m)(?=\s|$)/i;

export function parseTime(value) {
  if (typeof value === "number") return value;
  const match = String(value).trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour > 23) return null;
  return hour * 60 + Number(match[2]);
}

export function formatTime(minutes) {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hour = String(Math.floor(safeMinutes / 60)).padStart(2, "0");
  const minute = String(safeMinutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}

export function sortBlocks(blocks) {
  return [...blocks].sort((left, right) => left.start - right.start || left.end - right.end);
}

export function hasConflict(candidate, blocks, ignoredId = null) {
  return blocks.some((block) => {
    if (block.id === ignoredId) return false;
    return candidate.start < block.end && candidate.end > block.start;
  });
}

export function recurringRulesConflict(left, right) {
  const sharesDay = left.days.some((day) => right.days.includes(day));
  if (!sharesDay) return false;
  const leftEnd = left.start + left.duration;
  const rightEnd = right.start + right.duration;
  return left.start < rightEnd && leftEnd > right.start;
}

export function findNextFreeSlot(blocks, requestedStart, duration, dayStart, dayEnd) {
  if (duration <= 0 || dayEnd - dayStart < duration) return null;
  const sorted = sortBlocks(blocks).filter((block) => block.end > dayStart && block.start < dayEnd);
  let cursor = Math.max(dayStart, requestedStart);

  for (const block of sorted) {
    if (block.end <= cursor) continue;
    if (block.start - cursor >= duration) return { start: cursor, end: cursor + duration };
    cursor = Math.max(cursor, block.end);
  }

  return cursor + duration <= dayEnd ? { start: cursor, end: cursor + duration } : null;
}

export function parseQuickEntry(value, fallbackDuration = 30) {
  const normalized = String(value).trim();
  if (!normalized) return null;

  const timeMatch = normalized.match(TIME_PATTERN);
  const durationMatch = normalized.match(DURATION_PATTERN);
  const start = timeMatch ? Number(timeMatch[1]) * 60 + Number(timeMatch[2]) : null;
  const duration = durationMatch ? Number(durationMatch[1]) : fallbackDuration;
  const title = normalized
    .replace(TIME_PATTERN, " ")
    .replace(DURATION_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: title || "未命名安排",
    start,
    duration,
  };
}

export function occursOnDate(rule, date) {
  return rule.enabled !== false && Array.isArray(rule.days) && rule.days.includes(date.getDay());
}

export function materializeRecurring(rules, date, existingBlocks = []) {
  const additions = [];
  for (const rule of rules) {
    if (!occursOnDate(rule, date)) continue;
    const alreadyExists = existingBlocks.some((block) => block.sourceRuleId === rule.id)
      || additions.some((block) => block.sourceRuleId === rule.id);
    if (alreadyExists) continue;

    const candidate = {
      id: `block-${rule.id}-${date.toISOString().slice(0, 10)}`,
      title: rule.title,
      start: rule.start,
      end: rule.start + rule.duration,
      color: rule.color || "sage",
      done: false,
      sourceRuleId: rule.id,
    };
    if (!hasConflict(candidate, [...existingBlocks, ...additions])) additions.push(candidate);
  }
  return additions;
}
