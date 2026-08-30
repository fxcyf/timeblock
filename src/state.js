import { migrateBlocksByDate } from "./calendar.js";
import { exceptionId } from "./recurrence.js";
import { normalizeColorValue } from "./theme.js";

export const APP_STATE_VERSION = 2;
export const DEFAULT_SETTINGS = Object.freeze({ viewDayCount: 1, snapMinutes: 15, accentColor: "#486f65" });

function normalizeRule(rule) {
  return {
    ...rule,
    category: rule.category || null,
    startDate: rule.startDate || "2000-01-01",
    endDate: rule.endDate || null,
    inactiveRanges: Array.isArray(rule.inactiveRanges) ? rule.inactiveRanges : [],
    color: normalizeColorValue(rule.color, "sage"),
  };
}

function normalizeContent(content, index) {
  const { favorite, ...rest } = content;
  const status = ["oneTime", "favorite", "archived"].includes(content.status)
    ? content.status
    : (favorite === true ? "favorite" : "oneTime");
  return { ...rest, status, category: content.category || null, color: normalizeColorValue(content.color, "apricot"), sortOrder: Number.isInteger(content.sortOrder) ? content.sortOrder : index };
}

export function migrateAppState(saved, todayDateKey, defaults = {}) {
  const source = saved && typeof saved === "object" ? saved : {};
  const rules = (Array.isArray(source.rules) ? source.rules : (defaults.rules || [])).map(normalizeRule);
  const eventContents = (Array.isArray(source.eventContents) ? source.eventContents : (defaults.eventContents || [])).map(normalizeContent);
  const sourceBlocks = migrateBlocksByDate(source);
  const blocksByDate = {};
  const recurrenceExceptions = Array.isArray(source.recurrenceExceptions) ? [...source.recurrenceExceptions] : [];

  for (const [dateKey, blocks] of Object.entries(sourceBlocks)) {
    blocksByDate[dateKey] = [];
    for (const block of blocks) {
      if (!block.sourceRuleId) {
        blocksByDate[dateKey].push(block);
        continue;
      }
      if (recurrenceExceptions.some((item) => item.ruleId === block.sourceRuleId && item.date === dateKey)) continue;
      recurrenceExceptions.push({
        id: exceptionId(block.sourceRuleId, dateKey),
        ruleId: block.sourceRuleId,
        date: dateKey,
        title: block.title,
        category: block.category || null,
        start: block.start,
        end: block.end,
        color: block.color || "sage",
        done: block.done === true,
        cancelled: false,
      });
    }
  }

  const legacyDayCount = [1, 3, 7].includes(source.viewDayCount) ? source.viewDayCount : undefined;
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(source.settings || {}),
    viewDayCount: source.settings?.viewDayCount ?? legacyDayCount ?? DEFAULT_SETTINGS.viewDayCount,
  };
  if (![1, 3, 7].includes(settings.viewDayCount)) settings.viewDayCount = 1;
  if (![5, 15, 30].includes(settings.snapMinutes)) settings.snapMinutes = 15;
  settings.accentColor = normalizeColorValue(settings.accentColor, "#486f65");

  for (const blocks of Object.values(blocksByDate)) {
    for (const block of blocks) block.color = normalizeColorValue(block.color, "apricot");
  }
  for (const exception of recurrenceExceptions) exception.color = normalizeColorValue(exception.color, "sage");

  return {
    schemaVersion: APP_STATE_VERSION,
    settings,
    rules,
    recurrenceExceptions,
    eventContents,
    blocksByDate,
  };
}
