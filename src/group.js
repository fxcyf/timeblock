import { addDateKeyDays, dateFromKey } from "./calendar.js";
import { hasConflict } from "./schedule.js";

function dayDifference(from, to) {
  const fromDate = dateFromKey(from);
  const toDate = dateFromKey(to);
  if (!fromDate || !toDate) return null;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function detachedCopy(block, id) {
  const copy = { ...block, id, done: false };
  delete copy.recurring;
  delete copy.sourceRuleId;
  delete copy.recurrenceDate;
  return copy;
}

export function planGroupTransform({ items, targetDate, targetStart, mode, existingByDate = {}, createId = (_, index) => `block-${Date.now()}-${index}` }) {
  if (!Array.isArray(items) || !items.length || !dateFromKey(targetDate) || !Number.isInteger(targetStart) || !["move", "copy"].includes(mode)) {
    return { ok: false, candidates: [], conflicts: [{ reason: "invalid" }] };
  }
  const ordered = [...items].sort((left, right) => left.date.localeCompare(right.date) || left.block.start - right.block.start || left.block.end - right.block.end);
  const anchor = ordered[0];
  const selectedKeys = new Set(items.map((item) => `${item.date}|${item.block.id}`));
  const candidates = ordered.map((item, index) => {
    const dateOffset = dayDifference(anchor.date, item.date);
    const start = targetStart + item.block.start - anchor.block.start;
    const duration = item.block.end - item.block.start;
    const block = mode === "copy"
      ? detachedCopy(item.block, createId(item.block, index))
      : { ...item.block };
    block.start = start;
    block.end = start + duration;
    return { sourceDate: item.date, sourceBlock: item.block, targetDate: dateOffset === null ? null : addDateKeyDays(targetDate, dateOffset), block };
  });
  const conflicts = [];

  for (const candidate of candidates) {
    if (!candidate.targetDate || candidate.block.start < 0 || candidate.block.end > 1440 || candidate.block.end <= candidate.block.start) {
      conflicts.push({ candidate, reason: "boundary" });
      continue;
    }
    const existing = (existingByDate[candidate.targetDate] || []).filter((block) => (
      mode !== "move" || !selectedKeys.has(`${candidate.targetDate}|${block.id}`)
    ));
    if (hasConflict(candidate.block, existing)) conflicts.push({ candidate, reason: "existing" });
  }

  for (let index = 0; index < candidates.length; index += 1) {
    for (let peer = index + 1; peer < candidates.length; peer += 1) {
      if (candidates[index].targetDate === candidates[peer].targetDate && hasConflict(candidates[index].block, [candidates[peer].block])) {
        conflicts.push({ candidate: candidates[index], peer: candidates[peer], reason: "group" });
      }
    }
  }
  return { ok: conflicts.length === 0, candidates, conflicts };
}
