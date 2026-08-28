const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateFromKey(dateKey) {
  const match = String(dateKey).match(DATE_KEY_PATTERN);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateToKey(date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

export function addDateKeyDays(dateKey, amount) {
  const date = dateFromKey(dateKey);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + amount);
  return dateToKey(date);
}

export function visibleDateKeys(focusDateKey, dayCount) {
  const count = [1, 3, 7].includes(dayCount) ? dayCount : 1;
  let start = focusDateKey;
  if (count === 7) {
    const date = dateFromKey(focusDateKey);
    const offset = date.getUTCDay() === 0 ? -6 : 1 - date.getUTCDay();
    start = addDateKeyDays(focusDateKey, offset);
  }
  return Array.from({ length: count }, (_, index) => addDateKeyDays(start, index));
}

export function migrateBlocksByDate(saved) {
  if (saved?.blocksByDate && typeof saved.blocksByDate === "object" && !Array.isArray(saved.blocksByDate)) {
    return Object.fromEntries(Object.entries(saved.blocksByDate).filter(([, blocks]) => Array.isArray(blocks)));
  }
  if (typeof saved?.date === "string" && Array.isArray(saved.blocks)) {
    return { [saved.date]: saved.blocks };
  }
  return {};
}
