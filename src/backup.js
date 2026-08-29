import { migrateAppState } from "./state.js";

const BACKUP_FORMAT = "timeblock-backup";
const BACKUP_VERSION = 2;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PALETTE = new Set(["apricot", "sage", "blue", "lilac"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, label, maxLength = 120) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${label}无效`);
  return value.trim();
}

function optionalText(value, label, maxLength = 80) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) throw new Error(`${label}无效`);
  return value.trim() || null;
}

function dateKey(value, label, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) throw new Error(`${label}无效`);
  return value;
}

function paletteColor(value, fallback = "apricot") {
  const color = value ?? fallback;
  if (!PALETTE.has(color)) throw new Error("颜色数据无效");
  return color;
}

function minute(value, label, allowDayEnd = false) {
  const maximum = allowDayEnd ? 1440 : 1439;
  if (!Number.isInteger(value) || value < 0 || value > maximum) throw new Error(`${label}无效`);
  return value;
}

function normalizeInactiveRanges(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("暂停日期数据无效");
  return value.map((range) => {
    if (!isRecord(range)) throw new Error("暂停日期数据无效");
    const start = dateKey(range.start, "暂停开始日期");
    const end = dateKey(range.end, "暂停结束日期", true);
    if (end && end < start) throw new Error("暂停日期数据无效");
    return { start, end };
  });
}

function normalizeRule(rule, legacy = false) {
  if (!isRecord(rule) || !Array.isArray(rule.days)) throw new Error("重复日程数据无效");
  const start = minute(rule.start, "重复日程时间");
  if (!Number.isInteger(rule.duration) || rule.duration <= 0 || start + rule.duration > 1440) throw new Error("重复日程时长无效");
  const days = [...new Set(rule.days)];
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("重复日期无效");
  return {
    id: requiredText(rule.id, "重复日程 ID"),
    title: requiredText(rule.title, "重复日程名称"),
    category: optionalText(rule.category, "重复日程分类"),
    start,
    duration: rule.duration,
    days,
    startDate: legacy ? (rule.startDate || "2000-01-01") : dateKey(rule.startDate, "生效日期"),
    endDate: dateKey(rule.endDate, "结束日期", true),
    color: paletteColor(rule.color, "sage"),
    enabled: rule.enabled !== false,
    inactiveRanges: normalizeInactiveRanges(rule.inactiveRanges),
  };
}

function normalizeContent(content, index) {
  if (!isRecord(content)) throw new Error("事件内容数据无效");
  return {
    id: requiredText(content.id, "事件内容 ID"),
    title: requiredText(content.title, "事件内容名称"),
    category: optionalText(content.category, "事件内容分类"),
    favorite: content.favorite === true,
    color: paletteColor(content.color),
    sortOrder: Number.isInteger(content.sortOrder) && content.sortOrder >= 0 ? content.sortOrder : index,
  };
}

function normalizeBlock(block) {
  if (!isRecord(block)) throw new Error("时间块数据无效");
  const start = minute(block.start, "开始时间");
  const end = minute(block.end, "结束时间", true);
  if (end <= start) throw new Error("时间块范围无效");
  const normalized = {
    id: requiredText(block.id, "时间块 ID"),
    title: requiredText(block.title, "时间块名称"),
    start,
    end,
    color: paletteColor(block.color),
    done: block.done === true,
  };
  if (Object.hasOwn(block, "category")) normalized.category = optionalText(block.category, "时间块分类");
  if (Object.hasOwn(block, "contentId")) normalized.contentId = requiredText(block.contentId, "事件内容引用");
  if (Object.hasOwn(block, "sourceRuleId")) normalized.sourceRuleId = requiredText(block.sourceRuleId, "重复日程引用");
  return normalized;
}

function normalizeException(exception) {
  if (!isRecord(exception)) throw new Error("重复例外数据无效");
  const start = minute(exception.start, "例外开始时间");
  const end = minute(exception.end, "例外结束时间", true);
  if (end <= start) throw new Error("重复例外范围无效");
  return {
    id: requiredText(exception.id, "重复例外 ID"),
    ruleId: requiredText(exception.ruleId, "重复日程引用"),
    date: dateKey(exception.date, "重复例外日期"),
    title: requiredText(exception.title, "重复例外名称"),
    category: optionalText(exception.category, "重复例外分类"),
    start,
    end,
    color: paletteColor(exception.color, "sage"),
    done: exception.done === true,
    cancelled: exception.cancelled === true,
  };
}

function normalizeBlocksByDate(value) {
  if (!isRecord(value)) throw new Error("日期数据无效");
  const blocksByDate = {};
  for (const [key, blocks] of Object.entries(value)) {
    if (!DATE_KEY_PATTERN.test(key) || !Array.isArray(blocks)) throw new Error("日期数据无效");
    blocksByDate[key] = blocks.map(normalizeBlock);
  }
  return blocksByDate;
}

function normalizeV2State(state) {
  if (!isRecord(state) || !Array.isArray(state.rules) || !Array.isArray(state.eventContents) || !Array.isArray(state.recurrenceExceptions)) {
    throw new Error("备份状态结构无效");
  }
  const viewDayCount = state.settings?.viewDayCount;
  const snapMinutes = state.settings?.snapMinutes;
  return {
    schemaVersion: 2,
    settings: {
      viewDayCount: [1, 3, 7].includes(viewDayCount) ? viewDayCount : 1,
      snapMinutes: [5, 15, 30].includes(snapMinutes) ? snapMinutes : 15,
    },
    rules: state.rules.map((rule) => normalizeRule(rule)),
    recurrenceExceptions: state.recurrenceExceptions.map(normalizeException),
    eventContents: state.eventContents.map(normalizeContent),
    blocksByDate: normalizeBlocksByDate(state.blocksByDate),
  };
}

function normalizeLegacyState(state, migrationDate) {
  if (!isRecord(state) || !Array.isArray(state.rules) || !Array.isArray(state.eventContents)) throw new Error("备份状态结构无效");
  const rawBlocksByDate = isRecord(state.blocksByDate)
    ? state.blocksByDate
    : (typeof state.date === "string" && Array.isArray(state.blocks) ? { [state.date]: state.blocks } : null);
  if (!rawBlocksByDate) throw new Error("日期数据无效");
  const legacy = {
    ...state,
    rules: state.rules.map((rule) => normalizeRule(rule, true)),
    eventContents: state.eventContents.map(normalizeContent),
    blocksByDate: normalizeBlocksByDate(rawBlocksByDate),
  };
  return migrateAppState(legacy, migrationDate);
}

export function createBackup(state, exportedAt = new Date().toISOString()) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, state: normalizeV2State(state) };
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("无法解析 JSON 文件");
  }
  const migrationDate = typeof parsed?.exportedAt === "string" ? parsed.exportedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  if (parsed?.format === BACKUP_FORMAT) {
    if (parsed.version === 2) return normalizeV2State(parsed.state);
    if (parsed.version === 1) return normalizeLegacyState(parsed.state, migrationDate);
    throw new Error("不支持这个备份版本");
  }
  if (Object.hasOwn(parsed || {}, "schemaVersion") && parsed.schemaVersion !== 2) throw new Error("不支持这个状态版本");
  return parsed?.schemaVersion === 2 ? normalizeV2State(parsed) : normalizeLegacyState(parsed, migrationDate);
}
