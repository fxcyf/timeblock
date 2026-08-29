import {
  findNextFreeSlot,
  formatDuration,
  formatTime,
  hasConflict,
  parseTime,
  selectionRange,
  sortBlocks,
} from "./src/schedule.js";
import {
  colorForEventContent,
  eventContentCategories,
  favoriteEventContents,
  moveEventContent,
  removeEventContent,
  updateEventContent,
  upsertEventContent,
} from "./src/content.js";
import { addDateKeyDays, dateFromKey, visibleDateKeys as buildVisibleDateKeys } from "./src/calendar.js";
import { hasMovedBeyondTolerance } from "./src/gesture.js";
import { createBackup, parseBackup } from "./src/backup.js";
import { migrateAppState } from "./src/state.js";
import {
  materializeRecurringForDate,
  rulesConflictInRange,
  splitRecurringRule,
  upsertRecurrenceException,
} from "./src/recurrence.js";

const DAY_START = 0;
const DAY_END = 24 * 60;
const PIXELS_PER_MINUTE = 1.25;
const DEFAULT_BLOCK_DURATION = 45;
const LONG_PRESS_DELAY = 360;
const LONG_PRESS_MOVE_TOLERANCE = 8;
const STORAGE_KEY = "timeblock-state-v2";
const LEGACY_STORAGE_KEY = "timeblock-state-v1";
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
const FULL_DAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const COLORS = ["apricot", "sage", "blue", "lilac"];
const COLOR_VALUES = { apricot: "#a85f40", sage: "#55704f", blue: "#4f7187", lilac: "#715c82" };

const defaultRules = [
  { id: "dinner", title: "晚餐 & 放空", category: "用餐", start: 19 * 60, duration: 45, days: [0, 1, 2, 3, 4, 5, 6], startDate: "2000-01-01", endDate: null, color: "apricot", enabled: true, inactiveRanges: [] },
  { id: "workout", title: "运动一下", category: "健康", start: 20 * 60 + 10, duration: 50, days: [2, 4, 6], startDate: "2000-01-01", endDate: null, color: "sage", enabled: true, inactiveRanges: [] },
  { id: "reading", title: "安静阅读", category: "兴趣", start: 21 * 60 + 20, duration: 30, days: [0, 1, 3, 5], startDate: "2000-01-01", endDate: null, color: "blue", enabled: true, inactiveRanges: [] },
];

const defaultEventContents = [
  { id: "content-dinner", title: "晚餐 & 放空", category: "用餐", favorite: true, color: "apricot", sortOrder: 0 },
  { id: "content-workout", title: "运动一下", category: "健康", favorite: true, color: "sage", sortOrder: 1 },
  { id: "content-reading", title: "安静阅读", category: "兴趣", favorite: true, color: "blue", sortOrder: 2 },
  { id: "content-wind-down", title: "洗澡 & 收拾", category: "生活", favorite: true, color: "lilac", sortOrder: 3 },
];

let now = new Date();
let todayDateKey = toDateKey(now);
let state = loadState();
let focusDateKey = todayDateKey;
let viewDayCount = state.settings.viewDayCount;
let activeView = "today";
let toastTimer;
let undoSnapshot = null;
let ignoreBlockClickUntil = 0;
let activeSelection = null;
let selectionPoint = null;
let touchSelection = null;
let touchPageScrollPosition = null;
let suppressContextMenuUntil = 0;

const elements = Object.fromEntries([
  "actionOptions", "actionPicker", "blockCategory", "blockDate", "blockDialog", "blockDialogKicker", "blockDialogTitle", "blockEnd", "blockError", "blockForm", "blockId", "blockOriginalDate", "blockScopeField", "blockStart", "blockTitle", "cancelContentButton", "cancelLibraryContentButton", "categoryOptions", "clearDataButton", "clearDoneButton", "closeActionPicker", "closeLibraryContentButton", "contentCategory", "contentError", "contentFavorite", "contentForm", "contentListView", "contentTitle", "dataSummary", "dateEyebrow", "dayOptions", "defaultViewSetting", "deleteBlockButton", "deleteLibraryContentButton", "deleteRuleButton", "eventContentLibrary", "exportDataButton", "importDataButton", "importDataFile", "libraryContentCategory", "libraryContentDialog", "libraryContentDialogTitle", "libraryContentError", "libraryContentFavorite", "libraryContentForm", "libraryContentId", "libraryContentTitle", "manageView", "newContentButton", "newFavoriteButton", "newRuleButton", "nextRangeButton", "previousRangeButton", "recurringView", "ruleCategory", "ruleDialog", "ruleDialogTitle", "ruleDuration", "ruleEndDate", "ruleError", "ruleForm", "ruleId", "ruleList", "ruleStart", "ruleStartDate", "ruleTitle", "selectedRange", "snapSetting", "timeAxis", "timeline", "timelineDays", "timelineHeaders", "timelineScroll", "toast", "todayButton", "todayView", "topbar", "undoButton", "viewTitle", "weekStrip",
].map((id) => [id, document.querySelector(`#${id}`)]));

function toDateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function cloneState(value = state) {
  return structuredClone(value);
}

function loadState() {
  let saved = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    saved = null;
  }
  return migrateAppState(saved, todayDateKey, { rules: defaultRules, eventContents: defaultEventContents });
}

function emptyState() {
  return migrateAppState({ rules: [], eventContents: [], recurrenceExceptions: [], blocksByDate: {}, settings: { viewDayCount: 1, snapMinutes: 15 } }, todayDateKey);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast("浏览器未允许本地保存，本次修改仍然有效");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeColor(color, fallback = "apricot") {
  return COLORS.includes(color) ? color : fallback;
}

function showToast(message, snapshot = null) {
  clearTimeout(toastTimer);
  undoSnapshot = snapshot;
  elements.toast.querySelector("span").textContent = message;
  elements.undoButton.hidden = !snapshot;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("show");
    undoSnapshot = null;
  }, snapshot ? 5000 : 2800);
}

function commitChange(previous, message, canUndo = true) {
  saveState();
  renderAll();
  showToast(message, canUndo ? previous : null);
}

function visibleDateKeys() {
  return buildVisibleDateKeys(focusDateKey, viewDayCount);
}

function manualBlocksForDate(dateKey) {
  if (!Array.isArray(state.blocksByDate[dateKey])) state.blocksByDate[dateKey] = [];
  return state.blocksByDate[dateKey];
}

function recurringBlocksForDate(dateKey) {
  return materializeRecurringForDate(state.rules, state.recurrenceExceptions, dateKey);
}

function blocksForDate(dateKey) {
  return sortBlocks([...manualBlocksForDate(dateKey), ...recurringBlocksForDate(dateKey)]);
}

function setManualBlocksForDate(dateKey, blocks) {
  state.blocksByDate[dateKey] = blocks.filter((block) => !block.recurring && !block.sourceRuleId);
}

function findBlock(dateKey, id) {
  return blocksForDate(dateKey).find((block) => block.id === id);
}

function dateParts(dateKey) {
  const date = dateFromKey(dateKey);
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, weekday: date.getUTCDay(), year: date.getUTCFullYear() };
}

function parseScheduleTime(value, allowDayEnd = false) {
  if (allowDayEnd && String(value).trim() === "24:00") return DAY_END;
  return parseTime(value);
}

function displayScheduleTime(minutes) {
  return minutes === DAY_END ? "24:00" : formatTime(minutes);
}

function renderDate() {
  const keys = visibleDateKeys();
  const first = dateParts(keys[0]);
  const last = dateParts(keys.at(-1));
  elements.dateEyebrow.textContent = keys.length === 1
    ? `${first.month}月${first.day}日 · ${FULL_DAY_NAMES[first.weekday]}`
    : first.month === last.month ? `${first.month}月${first.day}—${last.day}日` : `${first.month}月${first.day}日—${last.month}月${last.day}日`;
  document.querySelectorAll("[data-view-days]").forEach((button) => button.classList.toggle("active", Number(button.dataset.viewDays) === viewDayCount));
}

function renderTimelineFrame() {
  const keys = visibleDateKeys();
  elements.timeline.style.height = `${DAY_END * PIXELS_PER_MINUTE}px`;
  elements.timeline.className = `timeline timeline-view-${viewDayCount}`;
  elements.timeline.style.setProperty("--view-days", String(viewDayCount));
  elements.timelineHeaders.style.setProperty("--view-days", String(viewDayCount));
  elements.timelineHeaders.innerHTML = `<span class="header-axis"></span>${keys.map((dateKey) => {
    const parts = dateParts(dateKey);
    return `<div class="day-header${dateKey === todayDateKey ? " today" : ""}"><span>${DAY_NAMES[parts.weekday]}</span><strong>${parts.day}</strong></div>`;
  }).join("")}`;

  elements.timeAxis.innerHTML = "";
  for (let minute = DAY_START; minute <= DAY_END; minute += 60) {
    const label = document.createElement("span");
    label.className = `axis-label${minute === DAY_START ? " edge-start" : ""}${minute === DAY_END ? " edge-end" : ""}`;
    label.style.top = `${minute * PIXELS_PER_MINUTE}px`;
    label.textContent = displayScheduleTime(minute);
    elements.timeAxis.append(label);
  }

  elements.timelineDays.innerHTML = keys.map((dateKey) => {
    const lines = [];
    for (let minute = DAY_START; minute <= DAY_END; minute += 30) lines.push(`<span class="grid-line${minute % 60 ? " half" : ""}" style="top:${minute * PIXELS_PER_MINUTE}px"></span>`);
    return `<section class="day-column" data-date="${dateKey}" aria-label="${dateKey}"><div class="day-grid">${lines.join("")}</div><div class="now-line" ${dateKey === todayDateKey ? "" : "hidden"}><span class="sr-only">现在</span></div><div class="blocks-layer" data-date="${dateKey}"></div><div class="draft-selection" hidden aria-live="polite"><span class="selection-time"></span></div></section>`;
  }).join("");
  const nowLine = elements.timelineDays.querySelector(`[data-date="${todayDateKey}"] .now-line`);
  if (nowLine) nowLine.style.top = `${(now.getHours() * 60 + now.getMinutes()) * PIXELS_PER_MINUTE}px`;
}

function renderBlocks() {
  for (const dateKey of visibleDateKeys()) {
    const layer = elements.timelineDays.querySelector(`.blocks-layer[data-date="${dateKey}"]`);
    if (!layer) continue;
    for (const block of blocksForDate(dateKey)) {
      if (block.end <= DAY_START || block.start >= DAY_END) continue;
      const article = document.createElement("article");
      article.className = `time-block ${safeColor(block.color)}${block.done ? " done" : ""}${block.end - block.start <= 30 ? " compact" : ""}`;
      article.dataset.id = block.id;
      article.dataset.date = dateKey;
      article.dataset.recurring = block.recurring ? "true" : "false";
      article.style.top = `${block.start * PIXELS_PER_MINUTE}px`;
      article.style.height = `${(block.end - block.start) * PIXELS_PER_MINUTE}px`;
      article.tabIndex = 0;
      article.setAttribute("role", "button");
      article.setAttribute("aria-label", `${block.category ? `${block.category}，` : ""}${block.title}，${dateKey} ${formatTime(block.start)} 到 ${displayScheduleTime(block.end)}，点击编辑`);
      article.innerHTML = `<span class="block-meta"><span>${formatTime(block.start)} — ${displayScheduleTime(block.end)}</span>${block.category ? `<span class="block-category">${escapeHtml(block.category)}</span>` : ""}</span><strong class="block-title">${escapeHtml(block.title)}</strong><button class="block-check" aria-label="${block.done ? "标记为未完成" : "标记为已完成"}"><svg><use href="#icon-check"></use></svg></button><span class="resize-handle" aria-hidden="true"></span>`;
      article.addEventListener("click", (event) => {
        if (Date.now() < ignoreBlockClickUntil || event.target.closest(".block-check")) return;
        openBlockDialog(block.id, dateKey);
      });
      article.addEventListener("keydown", (event) => {
        if (event.target === article && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openBlockDialog(block.id, dateKey); }
      });
      article.querySelector(".block-check").addEventListener("click", (event) => { event.stopPropagation(); toggleDone(block.id, dateKey); });
      article.addEventListener("pointerdown", startPointerAdjustment);
      layer.append(article);
    }
  }
}

function renderEventContents() {
  const favorites = favoriteEventContents(state.eventContents);
  elements.categoryOptions.innerHTML = eventContentCategories(state.eventContents).map((category) => `<option value="${escapeHtml(category)}"></option>`).join("");
  elements.actionOptions.innerHTML = favorites.length ? favorites.map((content) => `<button data-event-content-id="${escapeHtml(content.id)}" style="--action-color:var(--${safeColor(content.color)}-deep)"><span class="action-dot"></span><span class="action-copy"><strong>${escapeHtml(content.title)}</strong>${content.category ? `<small>${escapeHtml(content.category)}</small>` : ""}</span><svg><use href="#icon-arrow"></use></svg></button>`).join("") : '<p class="empty-content">还没有常用内容</p>';
  elements.eventContentLibrary.innerHTML = favorites.length ? favorites.map((content, index) => `<div class="content-library-item"><i class="${safeColor(content.color)}" aria-hidden="true"></i><span class="content-library-copy"><strong>${escapeHtml(content.title)}</strong><small>${escapeHtml(content.category || "未分类")}</small></span><span class="order-actions"><button data-move-content="${escapeHtml(content.id)}" data-direction="-1" aria-label="上移${escapeHtml(content.title)}" ${index === 0 ? "disabled" : ""}><svg><use href="#icon-up"></use></svg></button><button data-move-content="${escapeHtml(content.id)}" data-direction="1" aria-label="下移${escapeHtml(content.title)}" ${index === favorites.length - 1 ? "disabled" : ""}><svg><use href="#icon-down"></use></svg></button></span><button class="edit-content-button" data-edit-event-content="${escapeHtml(content.id)}" aria-label="编辑${escapeHtml(content.title)}"><svg><use href="#icon-chevron"></use></svg></button></div>`).join("") : '<p class="empty-state">还没有常用内容。添加后，划选时间时就能直接使用。</p>';
}

function renderWeekStrip() {
  elements.weekStrip.innerHTML = buildVisibleDateKeys(todayDateKey, 7).map((dateKey) => {
    const parts = dateParts(dateKey);
    const instances = recurringBlocksForDate(dateKey);
    return `<div class="week-day${dateKey === todayDateKey ? " today" : ""}"><span>${FULL_DAY_NAMES[parts.weekday]}</span><strong>${parts.day}</strong><div class="week-marks">${instances.map((block) => `<i style="--mark-color:${COLOR_VALUES[safeColor(block.color)]}"></i>`).join("")}</div></div>`;
  }).join("");
}

function renderRuleList() {
  elements.ruleList.innerHTML = state.rules.length ? state.rules.map((rule) => `<article class="rule-card${rule.enabled ? "" : " disabled"}" style="--rule-color:${COLOR_VALUES[safeColor(rule.color, "sage")]}"><span class="rule-color"></span><div class="rule-main"><strong>${escapeHtml(rule.title)}</strong><span class="rule-meta">${formatTime(rule.start)} · ${formatDuration(rule.duration)}${rule.endDate ? ` · 至 ${escapeHtml(rule.endDate)}` : ""}</span></div><div class="day-chips" aria-label="重复日期">${DAY_ORDER.map((day) => `<span class="${rule.days.includes(day) ? "on" : ""}">${DAY_NAMES[day]}</span>`).join("")}</div><div class="rule-actions"><button class="rule-edit" data-edit-rule="${escapeHtml(rule.id)}">编辑</button><label class="switch" aria-label="${rule.enabled ? "暂停" : "启用"}${escapeHtml(rule.title)}"><input type="checkbox" data-toggle-rule="${escapeHtml(rule.id)}" ${rule.enabled ? "checked" : ""} /><span></span></label></div></article>`).join("") : '<p class="empty-state">还没有重复日程。创建后，它会按规则动态出现在时间轴上。</p>';
}

function renderManagement() {
  const manualCount = Object.values(state.blocksByDate).flat().length;
  elements.dataSummary.textContent = `${manualCount} 个手动时间块 · ${state.rules.length} 条重复规则 · ${state.eventContents.length} 条内容`;
  elements.defaultViewSetting.value = String(state.settings.viewDayCount);
  elements.snapSetting.value = String(state.settings.snapMinutes);
}

function usesPageTimelineScroll() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function timelineDocumentTop() {
  return elements.timeline.getBoundingClientRect().top + window.scrollY;
}

function readTimelineScrollPosition() {
  return usesPageTimelineScroll() ? window.scrollY : elements.timelineScroll.scrollTop;
}

function restoreDocumentScrollPosition(position) {
  const previousBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
  window.scrollTo(0, position);
  document.documentElement.style.scrollBehavior = previousBehavior;
}

function restoreTimelineScrollPosition(position) {
  if (usesPageTimelineScroll()) restoreDocumentScrollPosition(position);
  else elements.timelineScroll.scrollTop = position;
}

function scrollTimelineToOffset(offset) {
  restoreTimelineScrollPosition(usesPageTimelineScroll() ? timelineDocumentTop() + offset : offset);
}

function setTouchScrollLock(active, position = null) {
  if (!active) {
    elements.timelineScroll.classList.remove("touch-selecting");
    if (touchPageScrollPosition === null) return;
    const restorePosition = touchPageScrollPosition;
    touchPageScrollPosition = null;
    document.documentElement.classList.remove("touch-selecting-page");
    document.body.style.removeProperty("top");
    restoreDocumentScrollPosition(restorePosition);
    return;
  }
  if (usesPageTimelineScroll()) {
    touchPageScrollPosition = position ?? window.scrollY;
    document.body.style.top = `-${touchPageScrollPosition}px`;
    document.documentElement.classList.add("touch-selecting-page");
  } else {
    elements.timelineScroll.classList.add("touch-selecting");
    if (position !== null) elements.timelineScroll.scrollTop = position;
  }
}

function renderAll() {
  const scrollPosition = activeView === "today" ? readTimelineScrollPosition() : 0;
  renderDate();
  renderTimelineFrame();
  renderBlocks();
  renderEventContents();
  renderWeekStrip();
  renderRuleList();
  renderManagement();
  if (activeView === "today") restoreTimelineScrollPosition(scrollPosition);
}

function openBlockDialog(id, dateKey) {
  clearTimelineSelection();
  const existing = id ? findBlock(dateKey, id) : null;
  let draft = existing;
  if (!draft) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const requested = dateKey === todayDateKey ? Math.ceil(currentMinutes / state.settings.snapMinutes) * state.settings.snapMinutes : DAY_START;
    const slot = findNextFreeSlot(blocksForDate(dateKey), requested, DEFAULT_BLOCK_DURATION, DAY_START, DAY_END) || { start: DAY_START, end: DEFAULT_BLOCK_DURATION };
    draft = { title: "", category: null, start: slot.start, end: slot.end, color: "apricot", done: false };
  }
  elements.blockForm.reset();
  elements.blockError.textContent = "";
  elements.blockId.value = existing?.id || "";
  elements.blockOriginalDate.value = existing ? dateKey : "";
  elements.blockDialogKicker.textContent = existing?.recurring ? "重复日程实例" : "时间块";
  elements.blockDialogTitle.textContent = existing ? "编辑安排" : "添加安排";
  elements.blockTitle.value = draft.title;
  elements.blockCategory.value = draft.category || "";
  elements.blockDate.value = dateKey;
  elements.blockStart.value = displayScheduleTime(draft.start);
  elements.blockEnd.value = displayScheduleTime(draft.end);
  elements.blockScopeField.hidden = !existing?.recurring;
  elements.deleteBlockButton.hidden = !existing;
  const colorRadio = elements.blockForm.querySelector(`[name="blockColor"][value="${safeColor(draft.color)}"]`);
  if (colorRadio) colorRadio.checked = true;
  elements.blockDialog.showModal();
  setTimeout(() => elements.blockTitle.focus(), 40);
}

function blockDraftFromForm(existing) {
  return {
    ...existing,
    title: elements.blockTitle.value.trim(),
    category: elements.blockCategory.value.trim() || null,
    start: parseScheduleTime(elements.blockStart.value),
    end: parseScheduleTime(elements.blockEnd.value, true),
    color: elements.blockForm.querySelector('[name="blockColor"]:checked')?.value || "apricot",
    done: existing?.done === true,
  };
}

function validateBlockDraft(candidate, targetDate, ignoredId = null) {
  if (!candidate.title) return "给这个时间块起个简单的名字。";
  if (candidate.start === null || candidate.end === null || candidate.start < 0 || candidate.end > DAY_END || candidate.end <= candidate.start) return "请选择 00:00 到 24:00 之间的有效时段。";
  if (!dateFromKey(targetDate)) return "请选择有效日期。";
  if (hasConflict(candidate, blocksForDate(targetDate), ignoredId)) return "这个时段和已有安排重叠了，换个时间试试。";
  return null;
}

function saveBlock(event) {
  event.preventDefault();
  const originalDate = elements.blockOriginalDate.value;
  const targetDate = elements.blockDate.value;
  const existing = elements.blockId.value ? findBlock(originalDate, elements.blockId.value) : null;
  const candidate = blockDraftFromForm(existing);
  const ignoredId = existing && originalDate === targetDate ? existing.id : null;
  const error = validateBlockDraft(candidate, targetDate, ignoredId);
  if (error) { elements.blockError.textContent = error; return; }

  const previous = cloneState();
  if (existing?.recurring) {
    const rule = state.rules.find((item) => item.id === existing.sourceRuleId);
    if (!rule) { elements.blockError.textContent = "找不到对应的重复规则。"; return; }
    const scope = new FormData(elements.blockForm).get("blockScope");
    if (scope === "future") {
      if (targetDate !== originalDate) { elements.blockError.textContent = "“这一次及以后”不能同时更换日期；可以先保存时间，再单独调整日期。"; return; }
      const nextRuleDraft = { ...rule, id: `rule-${Date.now()}`, title: candidate.title, category: candidate.category, start: candidate.start, duration: candidate.end - candidate.start, startDate: originalDate, color: candidate.color };
      if (state.rules.some((item) => item.id !== rule.id && item.enabled && rulesConflictInRange(nextRuleDraft, item))) { elements.blockError.textContent = "调整后的规则与另一条重复日程重叠。"; return; }
      const { previousRule, nextRule } = splitRecurringRule(rule, originalDate, nextRuleDraft);
      state.rules = [...state.rules.filter((item) => item.id !== rule.id), ...(previousRule ? [previousRule] : []), nextRule];
      state.recurrenceExceptions = state.recurrenceExceptions.filter((item) => item.ruleId !== rule.id || item.date < originalDate);
    } else if (targetDate === originalDate) {
      state.recurrenceExceptions = upsertRecurrenceException(state.recurrenceExceptions, rule, originalDate, candidate);
    } else {
      state.recurrenceExceptions = upsertRecurrenceException(state.recurrenceExceptions, rule, originalDate, { cancelled: true });
      setManualBlocksForDate(targetDate, [...manualBlocksForDate(targetDate), { ...candidate, id: `block-${Date.now()}`, recurring: undefined, sourceRuleId: undefined, recurrenceDate: undefined }]);
    }
  } else {
    const id = existing?.id || `block-${Date.now()}`;
    if (existing) setManualBlocksForDate(originalDate, manualBlocksForDate(originalDate).filter((block) => block.id !== id));
    setManualBlocksForDate(targetDate, [...manualBlocksForDate(targetDate), { ...candidate, id }]);
  }

  focusDateKey = targetDate;
  elements.blockDialog.close();
  commitChange(previous, existing ? "时间块已更新" : "安排已添加");
}

function deleteBlock() {
  const originalDate = elements.blockOriginalDate.value;
  const existing = findBlock(originalDate, elements.blockId.value);
  if (!existing) return;
  const scope = existing.recurring ? new FormData(elements.blockForm).get("blockScope") : "one";
  if (scope === "future" && !window.confirm("删除这一次及以后的日程？过去的实例会保留。")) return;
  const previous = cloneState();
  if (existing.recurring) {
    const rule = state.rules.find((item) => item.id === existing.sourceRuleId);
    if (!rule) return;
    if (scope === "future") {
      if (rule.startDate >= originalDate) state.rules = state.rules.filter((item) => item.id !== rule.id);
      else state.rules = state.rules.map((item) => item.id === rule.id ? { ...item, endDate: addDateKeyDays(originalDate, -1) } : item);
      state.recurrenceExceptions = state.recurrenceExceptions.filter((item) => item.ruleId !== rule.id || item.date < originalDate);
    } else {
      state.recurrenceExceptions = upsertRecurrenceException(state.recurrenceExceptions, rule, originalDate, { cancelled: true });
    }
  } else {
    setManualBlocksForDate(originalDate, manualBlocksForDate(originalDate).filter((block) => block.id !== existing.id));
  }
  elements.blockDialog.close();
  commitChange(previous, scope === "future" ? "这一次及以后的日程已删除" : "时间块已删除");
}

function toggleDone(id, dateKey) {
  const block = findBlock(dateKey, id);
  if (!block) return;
  const previous = cloneState();
  const nextDone = !block.done;
  if (block.recurring) {
    const rule = state.rules.find((item) => item.id === block.sourceRuleId);
    state.recurrenceExceptions = upsertRecurrenceException(state.recurrenceExceptions, rule, dateKey, { ...block, done: nextDone });
  } else {
    setManualBlocksForDate(dateKey, manualBlocksForDate(dateKey).map((item) => item.id === id ? { ...item, done: nextDone } : item));
  }
  commitChange(previous, nextDone ? "完成一项" : "已恢复");
}

function buildDayOptions(selectedDays = [1, 2, 3, 4, 5]) {
  elements.dayOptions.innerHTML = DAY_ORDER.map((day) => `<label><input type="checkbox" name="ruleDay" value="${day}" ${selectedDays.includes(day) ? "checked" : ""} /><span>${DAY_NAMES[day]}</span></label>`).join("");
}

function openRuleDialog(ruleId = null) {
  const rule = ruleId ? state.rules.find((item) => item.id === ruleId) : null;
  elements.ruleForm.reset();
  elements.ruleError.textContent = "";
  elements.ruleId.value = rule?.id || "";
  elements.ruleDialogTitle.textContent = rule ? "编辑重复日程" : "新建重复日程";
  elements.ruleTitle.value = rule?.title || "";
  elements.ruleCategory.value = rule?.category || "";
  elements.ruleStart.value = formatTime(rule?.start ?? 19 * 60 + 30);
  elements.ruleDuration.value = String(rule?.duration ?? 45);
  elements.ruleStartDate.value = rule?.startDate || focusDateKey;
  elements.ruleEndDate.value = rule?.endDate || "";
  elements.deleteRuleButton.hidden = !rule;
  buildDayOptions(rule?.days);
  const radio = elements.ruleForm.querySelector(`[name="ruleColor"][value="${safeColor(rule?.color, "sage")}"]`);
  if (radio) radio.checked = true;
  elements.ruleDialog.showModal();
  setTimeout(() => elements.ruleTitle.focus(), 40);
}

function saveRule(event) {
  event.preventDefault();
  const existing = state.rules.find((item) => item.id === elements.ruleId.value);
  const start = parseTime(elements.ruleStart.value);
  const duration = Number(elements.ruleDuration.value);
  const days = [...elements.ruleForm.querySelectorAll('[name="ruleDay"]:checked')].map((input) => Number(input.value));
  const candidate = {
    ...existing,
    id: existing?.id || `rule-${Date.now()}`,
    title: elements.ruleTitle.value.trim(),
    category: elements.ruleCategory.value.trim() || null,
    start,
    duration,
    days,
    startDate: elements.ruleStartDate.value,
    endDate: elements.ruleEndDate.value || null,
    color: elements.ruleForm.querySelector('[name="ruleColor"]:checked')?.value || "sage",
    enabled: existing?.enabled ?? true,
    inactiveRanges: existing?.inactiveRanges || [],
  };
  if (!candidate.title) { elements.ruleError.textContent = "请填写重复日程名称。"; return; }
  if (!days.length) { elements.ruleError.textContent = "至少选择一天。"; return; }
  if (start === null || !Number.isInteger(duration) || duration < 5 || start + duration > DAY_END) { elements.ruleError.textContent = "请选择有效的开始时间和持续时长。"; return; }
  if (!dateFromKey(candidate.startDate) || (candidate.endDate && (!dateFromKey(candidate.endDate) || candidate.endDate < candidate.startDate))) { elements.ruleError.textContent = "结束日期不能早于生效日期。"; return; }
  if (state.rules.some((rule) => rule.id !== candidate.id && rule.enabled && candidate.enabled && rulesConflictInRange(candidate, rule))) { elements.ruleError.textContent = "这些日期的同一时段已有重复日程。"; return; }
  const previous = cloneState();
  state.rules = existing ? state.rules.map((rule) => rule.id === candidate.id ? candidate : rule) : [...state.rules, candidate];
  elements.ruleDialog.close();
  commitChange(previous, existing ? "重复日程已更新" : "重复日程已创建");
}

function deleteRule() {
  const rule = state.rules.find((item) => item.id === elements.ruleId.value);
  if (!rule || !window.confirm(`删除“${rule.title}”这条规则？它动态生成的日程会消失，手动时间块不受影响。`)) return;
  const previous = cloneState();
  state.rules = state.rules.filter((item) => item.id !== rule.id);
  state.recurrenceExceptions = state.recurrenceExceptions.filter((item) => item.ruleId !== rule.id);
  elements.ruleDialog.close();
  commitChange(previous, "重复日程已删除");
}

function toggleRule(ruleId, enabled) {
  const previous = cloneState();
  state.rules = state.rules.map((rule) => {
    if (rule.id !== ruleId) return rule;
    const ranges = [...(rule.inactiveRanges || [])];
    if (!enabled) ranges.push({ start: todayDateKey, end: null });
    else {
      const openIndex = ranges.findLastIndex((range) => !range.end);
      if (openIndex >= 0) {
        if (ranges[openIndex].start === todayDateKey) ranges.splice(openIndex, 1);
        else ranges[openIndex] = { ...ranges[openIndex], end: addDateKeyDays(todayDateKey, -1) };
      }
    }
    return { ...rule, enabled, inactiveRanges: ranges };
  });
  commitChange(previous, enabled ? "重复日程已启用" : "重复日程已暂停");
}

function openLibraryContentEditor(contentId = null) {
  const content = contentId ? state.eventContents.find((item) => item.id === contentId) : null;
  elements.libraryContentForm.reset();
  elements.libraryContentError.textContent = "";
  elements.libraryContentId.value = content?.id || "";
  elements.libraryContentDialogTitle.textContent = content ? "编辑常用内容" : "添加常用内容";
  elements.libraryContentTitle.value = content?.title || "";
  elements.libraryContentCategory.value = content?.category || "";
  elements.libraryContentFavorite.checked = content ? content.favorite === true : true;
  elements.deleteLibraryContentButton.hidden = !content;
  const radio = elements.libraryContentForm.querySelector(`[name="libraryContentColor"][value="${safeColor(content?.color)}"]`);
  if (radio) radio.checked = true;
  elements.libraryContentDialog.showModal();
  setTimeout(() => elements.libraryContentTitle.focus(), 40);
}

function saveLibraryContent(event) {
  event.preventDefault();
  const id = elements.libraryContentId.value;
  const draft = { title: elements.libraryContentTitle.value, category: elements.libraryContentCategory.value, favorite: elements.libraryContentFavorite.checked, color: new FormData(elements.libraryContentForm).get("libraryContentColor") };
  if (!draft.title.trim()) { elements.libraryContentError.textContent = "请填写内容名称。"; return; }
  const previous = cloneState();
  if (id) {
    const result = updateEventContent(state.eventContents, id, draft);
    if (!result) { elements.libraryContentError.textContent = "已有同名且同分类的内容。"; return; }
    state.eventContents = result.contents;
  } else {
    const result = upsertEventContent(state.eventContents, { ...draft, id: `content-${Date.now()}`, sortOrder: state.eventContents.length });
    if (!result) return;
    state.eventContents = result.contents;
  }
  elements.libraryContentDialog.close();
  commitChange(previous, draft.favorite ? "常用内容已保存" : "内容已移出常用列表");
}

function deleteLibraryContent() {
  const content = state.eventContents.find((item) => item.id === elements.libraryContentId.value);
  if (!content || !window.confirm(`删除“${content.title}”？已创建的时间块会保留原有名称和分类。`)) return;
  const previous = cloneState();
  state.eventContents = removeEventContent(state.eventContents, content.id);
  elements.libraryContentDialog.close();
  commitChange(previous, "常用内容已删除");
}

function moveLibraryContent(id, direction) {
  const previous = cloneState();
  state.eventContents = moveEventContent(state.eventContents, id, direction);
  commitChange(previous, "常用内容顺序已更新");
}

function exportData() {
  const backup = createBackup(state);
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `timeblock-${todayDateKey}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("完整 JSON 备份已导出");
}

async function importData(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast("备份文件不能超过 2 MB"); return; }
  let imported;
  try { imported = parseBackup(await file.text()); }
  catch (error) { showToast(error instanceof Error ? error.message : "无法读取备份文件"); return; }
  if (!window.confirm("导入会替换当前浏览器中的全部 Timeblock 数据，是否继续？")) return;
  clearTimelineSelection();
  state = imported;
  viewDayCount = state.settings.viewDayCount;
  focusDateKey = todayDateKey;
  saveState();
  renderAll();
  switchView("manage");
  showToast("数据已导入");
}

function clearAllData() {
  if (!window.confirm("清空全部时间块、重复规则和常用内容？建议先导出备份。此操作完成后仍可立即撤销一次。")) return;
  const previous = cloneState();
  state = emptyState();
  viewDayCount = 1;
  focusDateKey = todayDateKey;
  commitChange(previous, "全部数据已清空");
}

function switchView(viewName) {
  if (viewName === "data") viewName = "manage";
  const views = { today: elements.todayView, recurring: elements.recurringView, manage: elements.manageView };
  if (!views[viewName]) viewName = "today";
  if (viewName !== "today") clearTimelineSelection();
  activeView = viewName;
  Object.entries(views).forEach(([name, view]) => { const active = name === viewName; view.classList.toggle("active", active); view.hidden = !active; });
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  elements.viewTitle.textContent = { today: "日程", recurring: "重复日程", manage: "管理" }[viewName];
  elements.topbar.hidden = viewName !== "today";
  history.replaceState(null, "", `#${viewName}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function changeVisibleRange(direction) {
  clearTimelineSelection();
  focusDateKey = addDateKeyDays(focusDateKey, direction * (viewDayCount === 7 ? 7 : viewDayCount));
  renderAll();
  scrollTimelineToOffset(viewDayCount === 1 && focusDateKey === todayDateKey ? Math.max(0, (now.getHours() * 60 + now.getMinutes() - 90) * PIXELS_PER_MINUTE) : 0);
}

function changeViewDayCount(dayCount) {
  if (![1, 3, 7].includes(dayCount) || dayCount === viewDayCount) return;
  clearTimelineSelection();
  viewDayCount = dayCount;
  state.settings.viewDayCount = dayCount;
  saveState();
  renderAll();
}

function goToToday() {
  clearTimelineSelection();
  focusDateKey = todayDateKey;
  renderAll();
  scrollTimelineToOffset(Math.max(0, (now.getHours() * 60 + now.getMinutes() - 90) * PIXELS_PER_MINUTE));
}

function minuteAtPointer(clientY) {
  const rect = elements.timeline.getBoundingClientRect();
  return Math.max(DAY_START, Math.min(DAY_END, (clientY - rect.top) / PIXELS_PER_MINUTE));
}

function renderDraftSelection(dateKey, range) {
  const conflict = hasConflict(range, blocksForDate(dateKey));
  activeSelection = { date: dateKey, ...range };
  const selection = elements.timelineDays.querySelector(`[data-date="${dateKey}"] .draft-selection`);
  if (!selection) return conflict;
  selection.hidden = false;
  selection.style.top = `${range.start * PIXELS_PER_MINUTE}px`;
  selection.style.height = `${(range.end - range.start) * PIXELS_PER_MINUTE}px`;
  selection.classList.toggle("invalid", conflict);
  selection.querySelector(".selection-time").textContent = `${displayScheduleTime(range.start)} — ${displayScheduleTime(range.end)}`;
  return conflict;
}

function positionActionPicker() {
  if (elements.actionPicker.hidden || !selectionPoint || window.innerWidth <= 760) return;
  const rect = elements.actionPicker.getBoundingClientRect();
  elements.actionPicker.style.left = `${Math.min(window.innerWidth - rect.width - 14, Math.max(14, selectionPoint.x + 18))}px`;
  elements.actionPicker.style.top = `${Math.min(window.innerHeight - rect.height - 14, Math.max(14, selectionPoint.y - rect.height / 2))}px`;
}

function showContentList(focus = false) {
  elements.contentForm.hidden = true;
  elements.contentListView.hidden = false;
  elements.contentError.textContent = "";
  positionActionPicker();
  if (focus) (elements.actionOptions.querySelector("button") || elements.newContentButton).focus({ preventScroll: true });
}

function openContentForm() {
  elements.contentForm.reset();
  elements.contentError.textContent = "";
  elements.contentListView.hidden = true;
  elements.contentForm.hidden = false;
  positionActionPicker();
  elements.contentTitle.focus({ preventScroll: true });
}

function showActionPicker(point) {
  if (!activeSelection) return;
  selectionPoint = point;
  const parts = dateParts(activeSelection.date);
  elements.selectedRange.textContent = `${viewDayCount === 1 ? "" : `${parts.month}/${parts.day} · `}${displayScheduleTime(activeSelection.start)} — ${displayScheduleTime(activeSelection.end)}`;
  renderEventContents();
  showContentList();
  elements.actionPicker.hidden = false;
  positionActionPicker();
  (elements.actionOptions.querySelector("button") || elements.newContentButton).focus({ preventScroll: true });
}

function clearTimelineSelection() {
  activeSelection = null;
  selectionPoint = null;
  elements.timelineDays?.querySelectorAll(".draft-selection").forEach((selection) => { selection.hidden = true; selection.classList.remove("invalid"); });
  elements.actionPicker.hidden = true;
  elements.actionPicker.style.removeProperty("left");
  elements.actionPicker.style.removeProperty("top");
  elements.timeline.classList.remove("selecting");
  setTouchScrollLock(false);
  showContentList();
}

function createBlockFromContent(content, previousOverride = null) {
  if (!activeSelection) return;
  const range = { ...activeSelection };
  if (hasConflict(range, blocksForDate(range.date))) { clearTimelineSelection(); showToast("这段时间已有安排，请重新划选"); return; }
  const previous = previousOverride || cloneState();
  setManualBlocksForDate(range.date, [...manualBlocksForDate(range.date), { id: `block-${Date.now()}`, ...(content.id ? { contentId: content.id } : {}), title: content.title, category: content.category || null, start: range.start, end: range.end, color: content.color || "apricot", done: false }]);
  clearTimelineSelection();
  commitChange(previous, `${displayScheduleTime(range.start)}—${displayScheduleTime(range.end)} 已安排`);
}

function saveEventContent(event) {
  event.preventDefault();
  if (!activeSelection) return;
  const title = elements.contentTitle.value.trim();
  const category = elements.contentCategory.value.trim();
  if (!title) { elements.contentError.textContent = "请填写内容名称。"; return; }
  const previous = cloneState();
  const draft = { title, category, color: colorForEventContent(state.eventContents, category, COLORS) };
  if (!elements.contentFavorite.checked) {
    createBlockFromContent(draft, previous);
    return;
  }
  const result = upsertEventContent(state.eventContents, { ...draft, id: `content-${Date.now()}`, favorite: true, sortOrder: state.eventContents.length });
  if (!result) return;
  state.eventContents = result.contents;
  createBlockFromContent(result.content, previous);
}

function completeTimelineSelection(dateKey, point) {
  elements.timeline.classList.remove("selecting");
  if (!activeSelection) return;
  if (hasConflict(activeSelection, blocksForDate(dateKey))) { clearTimelineSelection(); showToast("这段时间已有安排，请在空白处重新划选"); return; }
  showActionPicker(point);
}

function startTimelineSelection(event) {
  if (event.pointerType === "touch" || event.button !== 0 || event.target.closest(".time-block") || event.target.closest("button")) return;
  const column = event.target.closest(".day-column");
  if (!column) return;
  const dateKey = column.dataset.date;
  clearTimelineSelection();
  event.preventDefault();
  const anchor = minuteAtPointer(event.clientY);
  const select = (current) => selectionRange(anchor, current, DAY_START, DAY_END, state.settings.snapMinutes, state.settings.snapMinutes);
  elements.timeline.setPointerCapture(event.pointerId);
  elements.timeline.classList.add("selecting");
  renderDraftSelection(dateKey, select(anchor));
  const move = (moveEvent) => { moveEvent.preventDefault(); renderDraftSelection(dateKey, select(minuteAtPointer(moveEvent.clientY))); };
  const cleanup = () => { elements.timeline.removeEventListener("pointermove", move); elements.timeline.removeEventListener("pointerup", finish); elements.timeline.removeEventListener("pointercancel", cancel); };
  const finish = (upEvent) => { cleanup(); completeTimelineSelection(dateKey, { x: upEvent.clientX, y: upEvent.clientY }); };
  const cancel = () => { cleanup(); clearTimelineSelection(); };
  elements.timeline.addEventListener("pointermove", move);
  elements.timeline.addEventListener("pointerup", finish);
  elements.timeline.addEventListener("pointercancel", cancel, { once: true });
}

function touchById(touches, identifier) {
  return [...touches].find((touch) => touch.identifier === identifier);
}

function clearPendingTouchSelection(clearDraft = false) {
  if (!touchSelection) return;
  clearTimeout(touchSelection.timer);
  const wasActive = touchSelection.active;
  if (wasActive) setTouchScrollLock(false);
  touchSelection = null;
  elements.timeline.classList.remove("selecting");
  if (clearDraft && wasActive) clearTimelineSelection();
}

function startTouchTimelineSelection(event) {
  if (event.touches.length !== 1 || event.target.closest(".time-block") || event.target.closest("button")) return;
  const column = event.target.closest(".day-column");
  const touch = event.touches[0];
  if (!column || !touch) return;
  clearPendingTouchSelection(true);
  clearTimelineSelection();
  const pending = { active: false, anchor: minuteAtPointer(touch.clientY), dateKey: column.dataset.date, identifier: touch.identifier, origin: { x: touch.clientX, y: touch.clientY }, scrollPosition: readTimelineScrollPosition(), timer: null };
  pending.timer = setTimeout(() => {
    if (touchSelection !== pending) return;
    pending.active = true;
    suppressContextMenuUntil = Date.now() + 1200;
    elements.timeline.classList.add("selecting");
    setTouchScrollLock(true, pending.scrollPosition);
    renderDraftSelection(pending.dateKey, selectionRange(pending.anchor, pending.anchor, DAY_START, DAY_END, state.settings.snapMinutes, state.settings.snapMinutes));
    if (navigator.vibrate) navigator.vibrate(8);
  }, LONG_PRESS_DELAY);
  touchSelection = pending;
}

function moveTouchTimelineSelection(event) {
  if (!touchSelection) return;
  const touch = touchById(event.touches, touchSelection.identifier);
  if (!touch) return;
  if (!touchSelection.active) {
    if (hasMovedBeyondTolerance(touchSelection.origin, { x: touch.clientX, y: touch.clientY }, LONG_PRESS_MOVE_TOLERANCE)) clearPendingTouchSelection();
    return;
  }
  event.preventDefault();
  if (!usesPageTimelineScroll()) restoreTimelineScrollPosition(touchSelection.scrollPosition);
  renderDraftSelection(touchSelection.dateKey, selectionRange(touchSelection.anchor, minuteAtPointer(touch.clientY), DAY_START, DAY_END, state.settings.snapMinutes, state.settings.snapMinutes));
}

function finishTouchTimelineSelection(event) {
  if (!touchSelection) return;
  const touch = touchById(event.changedTouches, touchSelection.identifier);
  const finished = touchSelection;
  clearTimeout(finished.timer);
  touchSelection = null;
  if (!finished.active || !touch) return;
  event.preventDefault();
  setTouchScrollLock(false);
  completeTimelineSelection(finished.dateKey, { x: touch.clientX, y: touch.clientY });
}

function startPointerAdjustment(event) {
  if (event.button !== 0 || event.target.closest("button") || viewDayCount === 7) return;
  const article = event.currentTarget;
  const dateKey = article.dataset.date;
  const block = findBlock(dateKey, article.dataset.id);
  if (!block) return;
  const resizing = Boolean(event.target.closest(".resize-handle"));
  const originY = event.clientY;
  let deltaMinutes = 0;
  article.setPointerCapture(event.pointerId);
  article.classList.add("dragging");
  const move = (moveEvent) => {
    deltaMinutes = Math.round(((moveEvent.clientY - originY) / PIXELS_PER_MINUTE) / 5) * 5;
    if (resizing) article.style.height = `${(Math.max(block.start + 15, Math.min(DAY_END, block.end + deltaMinutes)) - block.start) * PIXELS_PER_MINUTE}px`;
    else { const duration = block.end - block.start; article.style.top = `${Math.max(DAY_START, Math.min(DAY_END - duration, block.start + deltaMinutes)) * PIXELS_PER_MINUTE}px`; }
  };
  const cleanup = () => { article.classList.remove("dragging"); article.removeEventListener("pointermove", move); article.removeEventListener("pointerup", finish); article.removeEventListener("pointercancel", cancel); };
  const finish = () => {
    cleanup();
    if (!deltaMinutes) return;
    ignoreBlockClickUntil = Date.now() + 250;
    const candidate = resizing
      ? { ...block, end: Math.max(block.start + 15, Math.min(DAY_END, block.end + deltaMinutes)) }
      : (() => { const duration = block.end - block.start; const start = Math.max(DAY_START, Math.min(DAY_END - duration, block.start + deltaMinutes)); return { ...block, start, end: start + duration }; })();
    if (hasConflict(candidate, blocksForDate(dateKey), block.id)) { renderAll(); showToast("这里已有安排，时间块已放回原位"); return; }
    const previous = cloneState();
    if (block.recurring) {
      const rule = state.rules.find((item) => item.id === block.sourceRuleId);
      state.recurrenceExceptions = upsertRecurrenceException(state.recurrenceExceptions, rule, dateKey, candidate);
    } else setManualBlocksForDate(dateKey, manualBlocksForDate(dateKey).map((item) => item.id === block.id ? candidate : item));
    commitChange(previous, resizing ? "时长已调整" : `已移动到 ${formatTime(candidate.start)}`);
  };
  const cancel = () => { cleanup(); renderAll(); };
  article.addEventListener("pointermove", move);
  article.addEventListener("pointerup", finish);
  article.addEventListener("pointercancel", cancel, { once: true });
}

document.addEventListener("click", (event) => {
  const content = event.target.closest("[data-event-content-id]");
  if (content) { const item = state.eventContents.find((entry) => entry.id === content.dataset.eventContentId); if (item) createBlockFromContent(item); return; }
  const editContent = event.target.closest("[data-edit-event-content]");
  if (editContent) { openLibraryContentEditor(editContent.dataset.editEventContent); return; }
  const moveContent = event.target.closest("[data-move-content]");
  if (moveContent) { moveLibraryContent(moveContent.dataset.moveContent, Number(moveContent.dataset.direction)); return; }
  const editRule = event.target.closest("[data-edit-rule]");
  if (editRule) openRuleDialog(editRule.dataset.editRule);
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-toggle-rule]")) toggleRule(event.target.dataset.toggleRule, event.target.checked);
});

document.addEventListener("pointerdown", (event) => {
  if (!elements.actionPicker.hidden && !elements.actionPicker.contains(event.target) && !event.target.closest(".timeline")) clearTimelineSelection();
});

document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !elements.actionPicker.hidden) clearTimelineSelection(); });
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-view-days]").forEach((button) => button.addEventListener("click", () => changeViewDayCount(Number(button.dataset.viewDays))));
elements.previousRangeButton.addEventListener("click", () => changeVisibleRange(-1));
elements.nextRangeButton.addEventListener("click", () => changeVisibleRange(1));
elements.todayButton.addEventListener("click", goToToday);
elements.clearDoneButton.addEventListener("click", () => {
  const completed = visibleDateKeys().flatMap((dateKey) => blocksForDate(dateKey).map((block) => ({ ...block, dateKey }))).filter((block) => block.done);
  if (!completed.length) { showToast("当前范围没有已完成项"); return; }
  const previous = cloneState();
  for (const block of completed) {
    if (block.recurring) {
      const rule = state.rules.find((item) => item.id === block.sourceRuleId);
      state.recurrenceExceptions = upsertRecurrenceException(state.recurrenceExceptions, rule, block.dateKey, { cancelled: true });
    } else setManualBlocksForDate(block.dateKey, manualBlocksForDate(block.dateKey).filter((item) => item.id !== block.id));
  }
  commitChange(previous, `已清理 ${completed.length} 个完成项`);
});
elements.closeActionPicker.addEventListener("click", clearTimelineSelection);
elements.newContentButton.addEventListener("click", openContentForm);
elements.cancelContentButton.addEventListener("click", () => showContentList(true));
elements.newRuleButton.addEventListener("click", () => openRuleDialog());
elements.ruleForm.addEventListener("submit", saveRule);
elements.deleteRuleButton.addEventListener("click", deleteRule);
elements.blockForm.addEventListener("submit", saveBlock);
elements.deleteBlockButton.addEventListener("click", deleteBlock);
elements.contentForm.addEventListener("submit", saveEventContent);
elements.newFavoriteButton.addEventListener("click", () => openLibraryContentEditor());
elements.libraryContentForm.addEventListener("submit", saveLibraryContent);
elements.deleteLibraryContentButton.addEventListener("click", deleteLibraryContent);
elements.closeLibraryContentButton.addEventListener("click", () => elements.libraryContentDialog.close());
elements.cancelLibraryContentButton.addEventListener("click", () => elements.libraryContentDialog.close());
elements.exportDataButton.addEventListener("click", exportData);
elements.importDataButton.addEventListener("click", () => elements.importDataFile.click());
elements.importDataFile.addEventListener("change", importData);
elements.clearDataButton.addEventListener("click", clearAllData);
elements.defaultViewSetting.addEventListener("change", () => changeViewDayCount(Number(elements.defaultViewSetting.value)));
elements.snapSetting.addEventListener("change", () => { state.settings.snapMinutes = Number(elements.snapSetting.value); saveState(); showToast(`已改为 ${state.settings.snapMinutes} 分钟吸附`); });
elements.undoButton.addEventListener("click", () => {
  if (!undoSnapshot) return;
  state = undoSnapshot;
  undoSnapshot = null;
  viewDayCount = state.settings.viewDayCount;
  saveState();
  renderAll();
  showToast("已撤销上一步");
});
elements.timeline.addEventListener("pointerdown", startTimelineSelection);
elements.timeline.addEventListener("touchstart", startTouchTimelineSelection, { passive: true });
elements.timeline.addEventListener("touchmove", moveTouchTimelineSelection, { passive: false });
elements.timeline.addEventListener("touchend", finishTouchTimelineSelection, { passive: false });
elements.timeline.addEventListener("touchcancel", () => clearPendingTouchSelection(true));
elements.timeline.addEventListener("contextmenu", (event) => { if (Date.now() < suppressContextMenuUntil && event.target.closest(".day-column")) event.preventDefault(); });
window.addEventListener("resize", positionActionPicker);
window.addEventListener("hashchange", () => switchView(window.location.hash.slice(1)));

renderAll();
goToToday();
const initialView = window.location.hash.slice(1);
if (["recurring", "manage", "data"].includes(initialView)) switchView(initialView);
setInterval(() => {
  const freshNow = new Date();
  if (toDateKey(freshNow) !== todayDateKey) { window.location.reload(); return; }
  now = freshNow;
  const nowLine = elements.timelineDays.querySelector(`[data-date="${todayDateKey}"] .now-line`);
  if (nowLine) nowLine.style.top = `${(now.getHours() * 60 + now.getMinutes()) * PIXELS_PER_MINUTE}px`;
}, 60_000);
