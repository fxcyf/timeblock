const BACKUP_FORMAT = "timeblock-backup";
const BACKUP_VERSION = 1;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PALETTE = new Set(["apricot", "sage", "blue", "lilac"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, label, maxLength = 120) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label}无效`);
  }
  return value.trim();
}

function optionalText(value, label, maxLength = 80) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) throw new Error(`${label}无效`);
  return value.trim() || null;
}

function paletteColor(value, fallback = "apricot") {
  const color = value ?? fallback;
  if (!PALETTE.has(color)) throw new Error("颜色数据无效");
  return color;
}

function minute(value, label, allowDayEnd = false) {
  const maximum = allowDayEnd ? 24 * 60 : 24 * 60 - 1;
  if (!Number.isInteger(value) || value < 0 || value > maximum) throw new Error(`${label}无效`);
  return value;
}

function normalizeRule(rule) {
  if (!isRecord(rule) || !Array.isArray(rule.days)) throw new Error("重复日程数据无效");
  const start = minute(rule.start, "重复日程时间");
  if (!Number.isInteger(rule.duration) || rule.duration <= 0 || start + rule.duration > 24 * 60) {
    throw new Error("重复日程时长无效");
  }
  const days = [...new Set(rule.days)];
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("重复日期无效");
  }
  return {
    id: requiredText(rule.id, "重复日程 ID"),
    title: requiredText(rule.title, "重复日程名称"),
    start,
    duration: rule.duration,
    days,
    color: paletteColor(rule.color, "sage"),
    enabled: rule.enabled !== false,
  };
}

function normalizeContent(content) {
  if (!isRecord(content)) throw new Error("事件内容数据无效");
  return {
    id: requiredText(content.id, "事件内容 ID"),
    title: requiredText(content.title, "事件内容名称"),
    category: optionalText(content.category, "事件内容分类"),
    favorite: content.favorite === true,
    color: paletteColor(content.color),
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

function normalizeState(state) {
  if (!isRecord(state) || !Array.isArray(state.rules) || !Array.isArray(state.eventContents)) {
    throw new Error("备份状态结构无效");
  }
  if (!isRecord(state.blocksByDate)) throw new Error("日期数据无效");
  const blocksByDate = {};
  for (const [dateKey, blocks] of Object.entries(state.blocksByDate)) {
    if (!DATE_KEY_PATTERN.test(dateKey) || !Array.isArray(blocks)) throw new Error("日期数据无效");
    blocksByDate[dateKey] = blocks.map(normalizeBlock);
  }
  return {
    rules: state.rules.map(normalizeRule),
    eventContents: state.eventContents.map(normalizeContent),
    blocksByDate,
    viewDayCount: [1, 3, 7].includes(state.viewDayCount) ? state.viewDayCount : 1,
  };
}

export function createBackup(state, exportedAt = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    state: normalizeState(state),
  };
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("无法解析 JSON 文件");
  }
  if (parsed?.format === BACKUP_FORMAT) {
    if (parsed.version !== BACKUP_VERSION) throw new Error("不支持这个备份版本");
    return normalizeState(parsed.state);
  }
  return normalizeState(parsed);
}
