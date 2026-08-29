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

export function selectionRange(anchor, current, dayStart, dayEnd, step = 15, minimumDuration = 15) {
  const rawStart = Math.min(anchor, current);
  const rawEnd = Math.max(anchor, current);
  const boundaryTolerance = Math.min(0.5, step / 30);
  let start = Math.max(dayStart, Math.floor((rawStart + boundaryTolerance) / step) * step);
  let end = Math.min(dayEnd, Math.ceil((rawEnd - boundaryTolerance) / step) * step);

  if (end - start < minimumDuration) {
    if (start + minimumDuration <= dayEnd) end = start + minimumDuration;
    else start = Math.max(dayStart, end - minimumDuration);
  }

  return { start, end };
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
