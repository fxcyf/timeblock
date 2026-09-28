import { migrateBlocksByDate } from "./calendar.js";
import { matchingEventContent } from "./content.js";
import { exceptionId } from "./recurrence.js";
import { DEFAULT_ACCENT_COLOR, DEFAULT_CONTENT_COLOR, DEFAULT_RULE_COLOR, normalizeColorValue } from "./theme.js";

export const APP_STATE_VERSION = 2;
export const DEFAULT_SETTINGS = Object.freeze({ viewDayCount: 1, snapMinutes: 15, accentColor: DEFAULT_ACCENT_COLOR });

function uniqueContentId(contents, seed) {
  let id = `content-${seed}`;
  let suffix = 2;
  while (contents.some((content) => content.id === id)) id = `content-${seed}-${suffix++}`;
  return id;
}

function linkedContentId(record, contents, seed, fallbackColor) {
  if (typeof record.contentId === "string" && record.contentId.trim()) return record.contentId.trim();
  const matching = matchingEventContent(contents, record.title, record.category);
  if (matching) return matching.id;
  const content = {
    id: uniqueContentId(contents, seed),
    title: String(record.title || "未命名内容").trim() || "未命名内容",
    category: record.category || null,
    status: "oneTime",
    color: fallbackColor,
    sortOrder: contents.length,
  };
  contents.push(content);
  return content.id;
}

function normalizeRule(rule, contents) {
  const { color, fallbackColor, ...rest } = rule;
  const normalizedFallback = normalizeColorValue(fallbackColor ?? color, DEFAULT_RULE_COLOR);
  return {
    ...rest,
    category: rule.category || null,
    startDate: rule.startDate || "2000-01-01",
    endDate: rule.endDate || null,
    inactiveRanges: Array.isArray(rule.inactiveRanges) ? rule.inactiveRanges : [],
    contentId: linkedContentId(rule, contents, `rule-${rule.id}`, normalizedFallback),
    fallbackColor: normalizedFallback,
  };
}

function normalizeContent(content, index) {
  const { favorite, ...rest } = content;
  const status = ["oneTime", "favorite", "archived"].includes(content.status)
    ? content.status
    : (favorite === true ? "favorite" : "oneTime");
  return { ...rest, status, category: content.category || null, color: normalizeColorValue(content.color, DEFAULT_CONTENT_COLOR), sortOrder: Number.isInteger(content.sortOrder) ? content.sortOrder : index };
}

function withoutCompletion(item) {
  const { done, ...rest } = item;
  return rest;
}

function normalizeLinkedRecord(item, contents, seed, fallback = DEFAULT_CONTENT_COLOR) {
  const { color, fallbackColor, ...rest } = withoutCompletion(item);
  const normalizedFallback = normalizeColorValue(fallbackColor ?? color, fallback);
  return {
    ...rest,
    contentId: linkedContentId(item, contents, seed, normalizedFallback),
    fallbackColor: normalizedFallback,
  };
}

function normalizeException(item, rules, contents) {
  const rule = rules.find((entry) => entry.id === item.ruleId);
  const source = { ...item, contentId: item.contentId || rule?.contentId };
  return normalizeLinkedRecord(source, contents, `exception-${item.ruleId}-${item.date}`, rule?.fallbackColor || DEFAULT_RULE_COLOR);
}

export function migrateAppState(saved, todayDateKey, defaults = {}) {
  const source = saved && typeof saved === "object" ? saved : {};
  const eventContents = (Array.isArray(source.eventContents) ? source.eventContents : (defaults.eventContents || [])).map(normalizeContent);
  const rules = (Array.isArray(source.rules) ? source.rules : (defaults.rules || [])).map((rule) => normalizeRule(rule, eventContents));
  const sourceBlocks = migrateBlocksByDate(source);
  const blocksByDate = {};
  const recurrenceExceptions = Array.isArray(source.recurrenceExceptions)
    ? source.recurrenceExceptions.map((item) => normalizeException(item, rules, eventContents))
    : [];

  for (const [dateKey, blocks] of Object.entries(sourceBlocks)) {
    blocksByDate[dateKey] = [];
    for (const block of blocks) {
      if (!block.sourceRuleId) {
        blocksByDate[dateKey].push(normalizeLinkedRecord(block, eventContents, `block-${dateKey}-${block.id}`));
        continue;
      }
      if (recurrenceExceptions.some((item) => item.ruleId === block.sourceRuleId && item.date === dateKey)) continue;
      const rule = rules.find((item) => item.id === block.sourceRuleId);
      recurrenceExceptions.push(normalizeLinkedRecord({
        id: exceptionId(block.sourceRuleId, dateKey),
        ruleId: block.sourceRuleId,
        date: dateKey,
        title: block.title,
        category: block.category || null,
        start: block.start,
        end: block.end,
        contentId: block.contentId || rule?.contentId,
        fallbackColor: block.fallbackColor || block.color || rule?.fallbackColor || DEFAULT_RULE_COLOR,
        cancelled: false,
      }, eventContents, `exception-${block.sourceRuleId}-${dateKey}`, rule?.fallbackColor || DEFAULT_RULE_COLOR));
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
  settings.accentColor = normalizeColorValue(settings.accentColor, DEFAULT_ACCENT_COLOR);

  return {
    schemaVersion: APP_STATE_VERSION,
    settings,
    rules,
    recurrenceExceptions,
    eventContents,
    blocksByDate,
  };
}
