import {
  findNextFreeSlot,
  formatDuration,
  formatTime,
  hasConflict,
  materializeRecurring,
  occursOnDate,
  parseTime,
  recurringRulesConflict,
  selectionRange,
  sortBlocks,
} from "./src/schedule.js";
import {
  colorForEventContent,
  eventContentCategories,
  favoriteEventContents,
  updateEventContent,
  upsertEventContent,
} from "./src/content.js";
import {
  addDateKeyDays,
  dateFromKey,
  migrateBlocksByDate,
  visibleDateKeys as buildVisibleDateKeys,
} from "./src/calendar.js";
import { hasMovedBeyondTolerance } from "./src/gesture.js";
import { createBackup, parseBackup } from "./src/backup.js";

const DAY_START = 0;
const DAY_END = 24 * 60;
const PIXELS_PER_MINUTE = 1.2;
const DEFAULT_BLOCK_DURATION = 45;
const LONG_PRESS_DELAY = 360;
const LONG_PRESS_MOVE_TOLERANCE = 8;
const STORAGE_KEY = "timeblock-state-v1";
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
const FULL_DAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const COLORS = ["apricot", "sage", "blue", "lilac"];
const COLOR_VALUES = {
  apricot: "#d79a78",
  sage: "#839a79",
  blue: "#7894aa",
  lilac: "#9380a7",
};

const defaultRules = [
  { id: "dinner", title: "晚餐 & 放空", start: 19 * 60, duration: 45, days: [0, 1, 2, 3, 4, 5, 6], color: "apricot", enabled: true },
  { id: "workout", title: "运动一下", start: 20 * 60 + 10, duration: 50, days: [2, 4, 6], color: "sage", enabled: true },
  { id: "reading", title: "安静阅读", start: 21 * 60 + 20, duration: 30, days: [0, 1, 3, 5], color: "blue", enabled: true },
];

const defaultEventContents = [
  { id: "content-dinner", title: "晚餐 & 放空", category: "用餐", favorite: true, color: "apricot" },
  { id: "content-workout", title: "运动一下", category: "健康", favorite: true, color: "sage" },
  { id: "content-reading", title: "安静阅读", category: "兴趣", favorite: true, color: "blue" },
  { id: "content-wind-down", title: "洗澡 & 收拾", category: "生活", favorite: true, color: "lilac" },
];

let now = new Date();
const todayDateKey = toDateKey(now);
let state = loadState();
let focusDateKey = todayDateKey;
let viewDayCount = [1, 3, 7].includes(state.viewDayCount) ? state.viewDayCount : 1;
let toastTimer;
let ignoreBlockClickUntil = 0;
let activeSelection = null;
let selectionPoint = null;
let touchSelection = null;
let touchPageScrollPosition = null;
let suppressContextMenuUntil = 0;

const elements = {
  actionOptions: document.querySelector("#actionOptions"),
  actionPicker: document.querySelector("#actionPicker"),
  blockCategory: document.querySelector("#blockCategory"),
  blockDate: document.querySelector("#blockDate"),
  blockDialog: document.querySelector("#blockDialog"),
  blockDialogKicker: document.querySelector("#blockDialogKicker"),
  blockDialogTitle: document.querySelector("#blockDialogTitle"),
  blockEnd: document.querySelector("#blockEnd"),
  blockError: document.querySelector("#blockError"),
  blockForm: document.querySelector("#blockForm"),
  blockId: document.querySelector("#blockId"),
  blockOriginalDate: document.querySelector("#blockOriginalDate"),
  blockStart: document.querySelector("#blockStart"),
  blockTitle: document.querySelector("#blockTitle"),
  cancelContentButton: document.querySelector("#cancelContentButton"),
  clearDoneButton: document.querySelector("#clearDoneButton"),
  contentCategory: document.querySelector("#contentCategory"),
  contentError: document.querySelector("#contentError"),
  contentFavorite: document.querySelector("#contentFavorite"),
  contentForm: document.querySelector("#contentForm"),
  contentListView: document.querySelector("#contentListView"),
  contentTitle: document.querySelector("#contentTitle"),
  categoryOptions: document.querySelector("#categoryOptions"),
  dataSummary: document.querySelector("#dataSummary"),
  dataView: document.querySelector("#dataView"),
  dateEyebrow: document.querySelector("#dateEyebrow"),
  dayOptions: document.querySelector("#dayOptions"),
  deleteBlockButton: document.querySelector("#deleteBlockButton"),
  eventContentLibrary: document.querySelector("#eventContentLibrary"),
  exportDataButton: document.querySelector("#exportDataButton"),
  importDataButton: document.querySelector("#importDataButton"),
  importDataFile: document.querySelector("#importDataFile"),
  libraryContentCategory: document.querySelector("#libraryContentCategory"),
  libraryContentDialog: document.querySelector("#libraryContentDialog"),
  libraryContentError: document.querySelector("#libraryContentError"),
  libraryContentFavorite: document.querySelector("#libraryContentFavorite"),
  libraryContentForm: document.querySelector("#libraryContentForm"),
  libraryContentId: document.querySelector("#libraryContentId"),
  libraryContentTitle: document.querySelector("#libraryContentTitle"),
  closeLibraryContentButton: document.querySelector("#closeLibraryContentButton"),
  cancelLibraryContentButton: document.querySelector("#cancelLibraryContentButton"),
  nextRangeButton: document.querySelector("#nextRangeButton"),
  newContentButton: document.querySelector("#newContentButton"),
  previousRangeButton: document.querySelector("#previousRangeButton"),
  recurringView: document.querySelector("#recurringView"),
  ruleCount: document.querySelector("#ruleCount"),
  ruleDialog: document.querySelector("#ruleDialog"),
  ruleError: document.querySelector("#ruleError"),
  ruleForm: document.querySelector("#ruleForm"),
  ruleList: document.querySelector("#ruleList"),
  selectedRange: document.querySelector("#selectedRange"),
  timeAxis: document.querySelector("#timeAxis"),
  timeline: document.querySelector("#timeline"),
  timelineDays: document.querySelector("#timelineDays"),
  timelineHeaders: document.querySelector("#timelineHeaders"),
  timelineScroll: document.querySelector("#timelineScroll"),
  toast: document.querySelector("#toast"),
  topbar: document.querySelector("#topbar"),
  todayView: document.querySelector("#todayView"),
  viewTitle: document.querySelector("#viewTitle"),
  weekStrip: document.querySelector("#weekStrip"),
};

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateForSchedule(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

function seedBlocks(rules, dateKey) {
  return materializeRecurring(rules, dateForSchedule(dateKey));
}

function loadState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    saved = null;
  }

  const rules = Array.isArray(saved?.rules) ? saved.rules : defaultRules;
  const eventContents = Array.isArray(saved?.eventContents) ? saved.eventContents : defaultEventContents;
  const blocksByDate = migrateBlocksByDate(saved);
  if (!Object.hasOwn(blocksByDate, todayDateKey)) blocksByDate[todayDateKey] = seedBlocks(rules, todayDateKey);
  return { rules, eventContents, blocksByDate, viewDayCount: saved?.viewDayCount };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast("浏览器未允许本地保存，本次修改仍然有效");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.querySelector("span").textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function safeColor(color, fallback = "apricot") {
  return COLORS.includes(color) ? color : fallback;
}

function visibleDateKeys() {
  return buildVisibleDateKeys(focusDateKey, viewDayCount);
}

function blocksForDate(dateKey) {
  if (!Object.hasOwn(state.blocksByDate, dateKey)) state.blocksByDate[dateKey] = seedBlocks(state.rules, dateKey);
  return state.blocksByDate[dateKey];
}

function setBlocksForDate(dateKey, blocks) {
  state.blocksByDate[dateKey] = blocks;
}

function dateParts(dateKey) {
  const date = dateFromKey(dateKey);
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    weekday: date.getUTCDay(),
    year: date.getUTCFullYear(),
  };
}

function renderDate() {
  const keys = visibleDateKeys();
  const first = dateParts(keys[0]);
  const last = dateParts(keys.at(-1));
  elements.dateEyebrow.textContent = keys.length === 1
    ? `${first.month}月${first.day}日 · ${FULL_DAY_NAMES[first.weekday]}`
    : first.month === last.month
      ? `${first.month}月${first.day}—${last.day}日`
      : `${first.month}月${first.day}日—${last.month}月${last.day}日`;
  document.querySelectorAll("[data-view-days]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.viewDays) === viewDayCount);
  });
}

function renderTimelineFrame() {
  const totalMinutes = DAY_END - DAY_START;
  const keys = visibleDateKeys();
  elements.timeline.style.height = `${totalMinutes * PIXELS_PER_MINUTE}px`;
  elements.timeline.className = `timeline timeline-view-${viewDayCount}`;
  elements.timeline.style.setProperty("--view-days", String(viewDayCount));
  elements.timeAxis.innerHTML = "";
  elements.timelineHeaders.style.setProperty("--view-days", String(viewDayCount));
  elements.timelineHeaders.innerHTML = `<span class="header-axis"></span>${keys.map((dateKey) => {
    const parts = dateParts(dateKey);
    return `<div class="day-header${dateKey === todayDateKey ? " today" : ""}"><span>${DAY_NAMES[parts.weekday]}</span><strong>${parts.day}</strong></div>`;
  }).join("")}`;

  for (let minute = DAY_START; minute <= DAY_END; minute += 60) {
    const offset = (minute - DAY_START) * PIXELS_PER_MINUTE;
    const label = document.createElement("span");
    label.className = "axis-label";
    if (minute === DAY_START) label.classList.add("edge-start");
    if (minute === DAY_END) label.classList.add("edge-end");
    label.style.top = `${offset}px`;
    label.textContent = minute === DAY_END ? "24:00" : formatTime(minute);
    elements.timeAxis.append(label);
  }

  elements.timelineDays.innerHTML = keys.map((dateKey) => {
    const lines = [];
    for (let minute = DAY_START; minute <= DAY_END; minute += 30) {
      lines.push(`<span class="grid-line${minute % 60 ? " half" : ""}" style="top:${minute * PIXELS_PER_MINUTE}px"></span>`);
    }
    return `<section class="day-column" data-date="${dateKey}" aria-label="${dateKey}">
      <div class="day-grid">${lines.join("")}</div>
      <div class="now-line" ${dateKey === todayDateKey ? "" : "hidden"}><span class="sr-only">现在</span></div>
      <div class="blocks-layer" data-date="${dateKey}"></div>
      <div class="draft-selection" hidden aria-live="polite"><span class="selection-time"></span></div>
    </section>`;
  }).join("");

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const nowLine = elements.timelineDays.querySelector(`[data-date="${todayDateKey}"] .now-line`);
  if (nowLine) nowLine.style.top = `${currentMinutes * PIXELS_PER_MINUTE}px`;
}

function renderBlocks() {
  for (const dateKey of visibleDateKeys()) {
    const layer = elements.timelineDays.querySelector(`.blocks-layer[data-date="${dateKey}"]`);
    if (!layer) continue;
    layer.innerHTML = "";
    for (const block of sortBlocks(blocksForDate(dateKey))) {
      if (block.end <= DAY_START || block.start >= DAY_END) continue;
      const article = document.createElement("article");
      const compact = block.end - block.start <= 30 ? " compact" : "";
      article.className = `time-block ${block.color || "apricot"}${block.done ? " done" : ""}${compact}`;
      article.dataset.id = block.id;
      article.dataset.date = dateKey;
      article.style.top = `${block.start * PIXELS_PER_MINUTE}px`;
      article.style.height = `${(block.end - block.start) * PIXELS_PER_MINUTE}px`;
      article.setAttribute("tabindex", "0");
      article.setAttribute("role", "button");
      article.setAttribute("aria-label", `${block.category ? `${block.category}，` : ""}${block.title}，${dateKey} ${formatTime(block.start)} 到 ${formatTime(block.end)}，点击编辑`);
      article.innerHTML = `
        <span class="block-meta"><span class="block-time">${formatTime(block.start)} — ${formatTime(block.end)}</span>${block.category ? `<span class="block-category">${escapeHtml(block.category)}</span>` : ""}</span>
        <strong class="block-title">${escapeHtml(block.title)}</strong>
        <button class="block-check" aria-label="${block.done ? "标记为未完成" : "标记为已完成"}"><svg><use href="#icon-check"></use></svg></button>
        <span class="resize-handle" aria-hidden="true"></span>
      `;
      article.addEventListener("click", (event) => {
        if (Date.now() < ignoreBlockClickUntil || event.target.closest(".block-check")) return;
        openBlockDialog(block.id, dateKey);
      });
      article.addEventListener("keydown", (event) => {
        if (event.target !== article) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openBlockDialog(block.id, dateKey);
        }
      });
      article.querySelector(".block-check").addEventListener("click", (event) => {
        event.stopPropagation();
        toggleDone(block.id, dateKey);
      });
      article.addEventListener("pointerdown", startPointerAdjustment);
      layer.append(article);
    }
  }
}

function renderEventContents() {
  const favorites = favoriteEventContents(state.eventContents);
  elements.categoryOptions.innerHTML = eventContentCategories(state.eventContents)
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
  elements.actionOptions.innerHTML = favorites.length
    ? favorites.map((content) => `<button data-event-content-id="${escapeHtml(content.id)}" style="--action-color:var(--${safeColor(content.color)})">
        <span class="action-dot"></span>
        <span class="action-copy"><strong>${escapeHtml(content.title)}</strong>${content.category ? `<small>${escapeHtml(content.category)}</small>` : ""}</span>
        <svg><use href="#icon-arrow"></use></svg>
      </button>`).join("")
    : '<p class="empty-content">暂无常用内容</p>';

  const contents = [...favorites].sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  elements.eventContentLibrary.innerHTML = contents.length
    ? contents.map((content) => `<button type="button" class="content-library-item" data-edit-event-content="${escapeHtml(content.id)}" aria-label="编辑${escapeHtml(content.title)}${content.category ? `，分类${escapeHtml(content.category)}` : "，未分类"}">
        <i class="${safeColor(content.color)}" aria-hidden="true"></i>
        <strong>${escapeHtml(content.title)}</strong>
        <small>${escapeHtml(content.category || "未分类")}</small>
      </button>`).join("")
    : '<p class="empty-content">暂无常用内容</p>';
}

function renderDataSummary() {
  const categoryCount = eventContentCategories(state.eventContents).length;
  elements.dataSummary.textContent = `${state.eventContents.length} 内容 · ${categoryCount} 分类 · ${state.rules.length} 规则`;
}

function renderWeekStrip() {
  const start = new Date(now);
  const offset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  start.setDate(now.getDate() + offset);
  const days = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const matching = state.rules.filter((rule) => occursOnDate(rule, date));
    days.push(`<div class="week-day${toDateKey(date) === todayDateKey ? " today" : ""}">
      <span>${FULL_DAY_NAMES[date.getDay()]}</span><strong>${date.getDate()}</strong>
      <div class="week-marks">${matching.map((rule) => `<i style="--mark-color:${COLOR_VALUES[rule.color]}"></i>`).join("")}</div>
    </div>`);
  }
  elements.weekStrip.innerHTML = days.join("");
}

function renderRuleList() {
  elements.ruleCount.textContent = state.rules.length;
  const focusedBlocks = blocksForDate(focusDateKey);
  elements.ruleList.innerHTML = state.rules.map((rule) => {
    const added = focusedBlocks.some((block) => block.sourceRuleId === rule.id);
    return `<article class="rule-card${rule.enabled ? "" : " disabled"}" style="--rule-color:${COLOR_VALUES[rule.color]}">
      <span class="rule-color"></span>
      <div class="rule-main"><strong>${escapeHtml(rule.title)}</strong><span class="rule-meta"><svg><use href="#icon-clock"></use></svg>${formatTime(rule.start)} · ${formatDuration(rule.duration)}</span></div>
      <div class="day-chips" aria-label="重复日期">${DAY_ORDER.map((day) => `<span class="${rule.days.includes(day) ? "on" : ""}">${DAY_NAMES[day]}</span>`).join("")}</div>
      <button class="rule-add" data-apply-rule="${escapeHtml(rule.id)}" aria-label="${added ? "该日已安排" : `将${escapeHtml(rule.title)}加入该日`}" ${added || !rule.enabled ? "disabled" : ""}><svg><use href="#icon-${added ? "check" : "plus"}"></use></svg></button>
      <label class="switch" aria-label="${rule.enabled ? "停用" : "启用"}${escapeHtml(rule.title)}"><input type="checkbox" data-toggle-rule="${escapeHtml(rule.id)}" ${rule.enabled ? "checked" : ""} /><span></span></label>
    </article>`;
  }).join("");
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
  if (usesPageTimelineScroll()) return restoreDocumentScrollPosition(position);
  elements.timelineScroll.scrollTop = position;
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
    return;
  }

  elements.timelineScroll.classList.add("touch-selecting");
  if (position !== null) elements.timelineScroll.scrollTop = position;
}

function renderAll() {
  const scrollPosition = readTimelineScrollPosition();
  renderDate();
  renderTimelineFrame();
  renderBlocks();
  renderEventContents();
  renderDataSummary();
  renderWeekStrip();
  renderRuleList();
  restoreTimelineScrollPosition(scrollPosition);
}

function parseScheduleTime(value, allowDayEnd = false) {
  if (allowDayEnd && String(value).trim() === "24:00") return DAY_END;
  return parseTime(value);
}

function displayScheduleTime(minutes) {
  return minutes === DAY_END ? "24:00" : formatTime(minutes);
}

function openBlockDialog(id = null, dateKey = focusDateKey, draftOverride = null) {
  if (!draftOverride) clearTimelineSelection();
  elements.blockError.textContent = "";
  elements.blockId.value = id || "";
  const existing = id ? blocksForDate(dateKey).find((block) => block.id === id) : null;
  let draft = existing || draftOverride;
  if (!draft) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const requested = dateKey === todayDateKey && currentMinutes >= DAY_START && currentMinutes < DAY_END
      ? Math.ceil(currentMinutes / 5) * 5
      : DAY_START;
    const slot = findNextFreeSlot(blocksForDate(dateKey), requested, DEFAULT_BLOCK_DURATION, DAY_START, DAY_END)
      || { start: DAY_START, end: DAY_START + DEFAULT_BLOCK_DURATION };
    draft = { title: "", start: slot.start, end: slot.end, color: "apricot" };
  }
  elements.blockDate.value = draft.date || dateKey;
  elements.blockOriginalDate.value = existing ? dateKey : "";
  elements.blockDialogKicker.textContent = existing ? "时间块" : "新的时间块";
  elements.blockDialogTitle.textContent = existing ? "编辑安排" : "添加安排";
  elements.blockTitle.value = draft.title;
  elements.blockCategory.value = draft.category || "";
  elements.blockStart.value = displayScheduleTime(draft.start);
  elements.blockEnd.value = displayScheduleTime(draft.end);
  elements.deleteBlockButton.hidden = !existing;
  const colorRadio = elements.blockForm.querySelector(`[name="blockColor"][value="${draft.color || "apricot"}"]`);
  if (colorRadio) colorRadio.checked = true;
  elements.blockDialog.showModal();
  setTimeout(() => elements.blockTitle.focus(), 50);
}

function saveBlock(event) {
  event.preventDefault();
  const start = parseScheduleTime(elements.blockStart.value);
  const end = parseScheduleTime(elements.blockEnd.value, true);
  const id = elements.blockId.value || `block-${Date.now()}`;
  const originalDate = elements.blockOriginalDate.value;
  const targetDate = elements.blockDate.value;
  const originalBlocks = originalDate ? blocksForDate(originalDate) : [];
  const existing = originalBlocks.find((block) => block.id === id);
  const candidate = {
    ...existing,
    id,
    title: elements.blockTitle.value.trim(),
    category: elements.blockCategory.value.trim() || null,
    start,
    end,
    color: elements.blockForm.querySelector('[name="blockColor"]:checked').value,
    done: existing?.done || false,
  };

  if (!candidate.title) {
    elements.blockError.textContent = "给这个时间块起个简单的名字。";
    return;
  }
  if (start === null || end === null || start < DAY_START || end > DAY_END || end <= start) {
    elements.blockError.textContent = "请选择 00:00 到 24:00 之间的有效时段。";
    return;
  }
  if (!dateFromKey(targetDate)) {
    elements.blockError.textContent = "请选择有效日期。";
    return;
  }
  if (hasConflict(candidate, blocksForDate(targetDate), originalDate === targetDate ? id : null)) {
    elements.blockError.textContent = "这个时段和已有安排重叠了，换个时间试试。";
    return;
  }

  if (existing) setBlocksForDate(originalDate, originalBlocks.filter((block) => block.id !== id));
  setBlocksForDate(targetDate, [...blocksForDate(targetDate), candidate]);
  focusDateKey = targetDate;
  saveState();
  renderAll();
  elements.blockDialog.close();
  showToast(existing ? "时间块已更新" : "安排已添加");
}

function deleteBlock() {
  const id = elements.blockId.value;
  if (!id) return;
  const dateKey = elements.blockOriginalDate.value || elements.blockDate.value;
  setBlocksForDate(dateKey, blocksForDate(dateKey).filter((block) => block.id !== id));
  saveState();
  renderAll();
  elements.blockDialog.close();
  showToast("时间块已删除");
}

function toggleDone(id, dateKey) {
  setBlocksForDate(dateKey, blocksForDate(dateKey).map((block) => block.id === id ? { ...block, done: !block.done } : block));
  saveState();
  renderAll();
  const block = blocksForDate(dateKey).find((item) => item.id === id);
  showToast(block.done ? "完成一项" : "已恢复");
}

function applyRule(ruleId) {
  const rule = state.rules.find((item) => item.id === ruleId);
  if (!rule || !rule.enabled) return;
  const dateKey = focusDateKey;
  const dateBlocks = blocksForDate(dateKey);
  if (dateBlocks.some((block) => block.sourceRuleId === rule.id)) {
    showToast("该日已有这个重复日程");
    return;
  }
  const candidate = {
    id: `block-${rule.id}-${dateKey}`,
    title: rule.title,
    start: rule.start,
    end: rule.start + rule.duration,
    color: rule.color,
    done: false,
    sourceRuleId: rule.id,
  };
  if (hasConflict(candidate, dateBlocks)) {
    showToast("这个时间已有安排，先调整一下时间轴吧");
    return;
  }
  setBlocksForDate(dateKey, [...dateBlocks, candidate]);
  saveState();
  renderAll();
  showToast("重复日程已加入该日");
}

function buildDayOptions() {
  elements.dayOptions.innerHTML = DAY_ORDER.map((day) => `<label><input type="checkbox" name="ruleDay" value="${day}" ${day > 0 && day < 6 ? "checked" : ""} /><span>${DAY_NAMES[day]}</span></label>`).join("");
}

function openRuleDialog() {
  elements.ruleError.textContent = "";
  elements.ruleForm.reset();
  document.querySelector("#ruleStart").value = "19:30";
  document.querySelector("#ruleDuration").value = "45";
  buildDayOptions();
  elements.ruleDialog.showModal();
  setTimeout(() => document.querySelector("#ruleTitle").focus(), 50);
}

function saveRule(event) {
  event.preventDefault();
  const title = document.querySelector("#ruleTitle").value.trim();
  const start = parseTime(document.querySelector("#ruleStart").value);
  const duration = Number(document.querySelector("#ruleDuration").value);
  const days = [...elements.ruleForm.querySelectorAll('[name="ruleDay"]:checked')].map((input) => Number(input.value));
  if (!title) {
    elements.ruleError.textContent = "给这个日程起个名字。";
    return;
  }
  if (!days.length) {
    elements.ruleError.textContent = "至少选择一天。";
    return;
  }
  if (start < DAY_START || start + duration > DAY_END) {
    elements.ruleError.textContent = `重复日程需要落在 ${formatTime(DAY_START)}—${formatTime(DAY_END)} 内。`;
    return;
  }
  const candidate = {
    id: `rule-${Date.now()}`,
    title,
    start,
    duration,
    days,
    color: COLORS[state.rules.length % COLORS.length],
    enabled: true,
  };
  if (state.rules.some((rule) => rule.enabled && recurringRulesConflict(candidate, rule))) {
    elements.ruleError.textContent = "这些天的同一时段已有重复日程，请换个时间。";
    return;
  }
  state.rules.push(candidate);
  saveState();
  renderAll();
  elements.ruleDialog.close();
  showToast("新的生活节奏已创建");
}

function toggleRule(ruleId, enabled) {
  state.rules = state.rules.map((rule) => rule.id === ruleId ? { ...rule, enabled } : rule);
  saveState();
  renderAll();
  showToast(enabled ? "重复日程已启用" : "重复日程已暂停");
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
  showToast("JSON 备份已导出");
}

async function importData(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast("备份文件不能超过 2 MB");
    return;
  }

  let importedState;
  try {
    importedState = parseBackup(await file.text());
  } catch (error) {
    showToast(error instanceof Error ? error.message : "无法读取备份文件");
    return;
  }
  if (!window.confirm("导入会替换当前浏览器中的全部 Timeblock 数据，是否继续？")) return;

  clearTimelineSelection();
  state = importedState;
  viewDayCount = importedState.viewDayCount;
  focusDateKey = todayDateKey;
  saveState();
  renderAll();
  switchView("data");
  showToast("数据已导入");
}

function switchView(viewName) {
  const views = {
    today: elements.todayView,
    recurring: elements.recurringView,
    data: elements.dataView,
  };
  if (!views[viewName]) viewName = "today";
  const isToday = viewName === "today";
  if (!isToday) clearTimelineSelection();
  Object.entries(views).forEach(([name, view]) => {
    const active = name === viewName;
    view.classList.toggle("active", active);
    view.hidden = !active;
  });
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  elements.viewTitle.textContent = { today: "日程", recurring: "重复", data: "数据" }[viewName];
  elements.topbar.hidden = !isToday;
  elements.clearDoneButton.hidden = !isToday;
  window.location.hash = viewName;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function changeVisibleRange(direction) {
  clearTimelineSelection();
  const step = viewDayCount === 7 ? 7 : viewDayCount;
  focusDateKey = addDateKeyDays(focusDateKey, direction * step);
  renderAll();
  scrollTimelineToOffset(viewDayCount === 1 && focusDateKey === todayDateKey
    ? Math.max(0, (now.getHours() * 60 + now.getMinutes() - 90) * PIXELS_PER_MINUTE)
    : 0);
}

function changeViewDayCount(dayCount) {
  if (![1, 3, 7].includes(dayCount) || dayCount === viewDayCount) return;
  clearTimelineSelection();
  viewDayCount = dayCount;
  state.viewDayCount = dayCount;
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
  const timelineRect = elements.timeline.getBoundingClientRect();
  const minute = DAY_START + (clientY - timelineRect.top) / PIXELS_PER_MINUTE;
  return Math.max(DAY_START, Math.min(DAY_END, minute));
}

function renderDraftSelection(dateKey, range) {
  const conflict = hasConflict(range, blocksForDate(dateKey));
  activeSelection = { date: dateKey, ...range };
  const draftSelection = elements.timelineDays.querySelector(`[data-date="${dateKey}"] .draft-selection`);
  const selectionTime = draftSelection?.querySelector(".selection-time");
  if (!draftSelection || !selectionTime) return conflict;
  draftSelection.hidden = false;
  draftSelection.style.top = `${(range.start - DAY_START) * PIXELS_PER_MINUTE}px`;
  draftSelection.style.height = `${(range.end - range.start) * PIXELS_PER_MINUTE}px`;
  draftSelection.classList.toggle("invalid", conflict);
  draftSelection.classList.toggle("compact", range.end - range.start <= 15);
  selectionTime.textContent = `${displayScheduleTime(range.start)} — ${displayScheduleTime(range.end)}`;
  return conflict;
}

function positionActionPicker() {
  if (elements.actionPicker.hidden || !selectionPoint) return;
  if (window.innerWidth <= 760) {
    elements.actionPicker.style.removeProperty("left");
    elements.actionPicker.style.removeProperty("top");
    return;
  }
  const pickerRect = elements.actionPicker.getBoundingClientRect();
  const left = Math.min(window.innerWidth - pickerRect.width - 14, Math.max(14, selectionPoint.x + 18));
  const top = Math.min(window.innerHeight - pickerRect.height - 14, Math.max(14, selectionPoint.y - pickerRect.height / 2));
  elements.actionPicker.style.left = `${left}px`;
  elements.actionPicker.style.top = `${top}px`;
}

function showContentList(shouldFocus = false) {
  elements.contentForm.hidden = true;
  elements.contentListView.hidden = false;
  elements.contentError.textContent = "";
  positionActionPicker();
  if (shouldFocus) {
    (elements.actionOptions.querySelector("[data-event-content-id]") || elements.newContentButton).focus({ preventScroll: true });
  }
}

function openContentForm() {
  if (!activeSelection) return;
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
  const dayLabel = viewDayCount === 1 ? "" : `${parts.month}/${parts.day} · `;
  elements.selectedRange.textContent = `${dayLabel}${displayScheduleTime(activeSelection.start)} — ${displayScheduleTime(activeSelection.end)}`;
  renderEventContents();
  showContentList();
  elements.actionPicker.hidden = false;
  positionActionPicker();
  (elements.actionOptions.querySelector("[data-event-content-id]") || elements.newContentButton).focus({ preventScroll: true });
}

function clearTimelineSelection() {
  activeSelection = null;
  selectionPoint = null;
  elements.timelineDays?.querySelectorAll(".draft-selection").forEach((selection) => {
    selection.hidden = true;
    selection.classList.remove("invalid", "compact");
  });
  elements.actionPicker.hidden = true;
  elements.actionPicker.style.removeProperty("left");
  elements.actionPicker.style.removeProperty("top");
  elements.timeline.classList.remove("selecting");
  setTouchScrollLock(false);
  showContentList();
}

function createBlockFromContent(content) {
  if (!activeSelection) return;
  const range = { ...activeSelection };
  const dateBlocks = blocksForDate(range.date);
  if (hasConflict(range, dateBlocks)) {
    clearTimelineSelection();
    showToast("这段时间已有安排，请重新划选");
    return;
  }
  setBlocksForDate(range.date, [...dateBlocks, {
    id: `block-${Date.now()}`,
    contentId: content.id,
    title: content.title,
    category: content.category || null,
    start: range.start,
    end: range.end,
    color: content.color || "apricot",
    done: false,
  }]);
  clearTimelineSelection();
  saveState();
  renderAll();
  showToast(`${displayScheduleTime(range.start)}—${displayScheduleTime(range.end)} 已安排「${content.title}」`);
}

function saveEventContent(event) {
  event.preventDefault();
  if (!activeSelection) return;
  const title = elements.contentTitle.value.trim();
  const category = elements.contentCategory.value.trim();
  if (!title) {
    elements.contentError.textContent = "请填写事件内容。";
    elements.contentTitle.focus();
    return;
  }
  const result = upsertEventContent(state.eventContents, {
    id: `content-${Date.now()}`,
    title,
    category,
    favorite: elements.contentFavorite.checked,
    color: colorForEventContent(state.eventContents, category, COLORS),
  });
  if (!result) return;
  state.eventContents = result.contents;
  createBlockFromContent(result.content);
}

function openLibraryContentEditor(contentId) {
  const content = state.eventContents.find((item) => item.id === contentId && item.favorite === true);
  if (!content) return;
  elements.libraryContentForm.reset();
  elements.libraryContentError.textContent = "";
  elements.libraryContentId.value = content.id;
  elements.libraryContentTitle.value = content.title;
  elements.libraryContentCategory.value = content.category || "";
  elements.libraryContentFavorite.checked = true;
  const colorRadio = elements.libraryContentForm.querySelector(`[name="libraryContentColor"][value="${safeColor(content.color)}"]`);
  if (colorRadio) colorRadio.checked = true;
  elements.libraryContentDialog.showModal();
  elements.libraryContentTitle.focus();
}

function saveLibraryContent(event) {
  event.preventDefault();
  const title = elements.libraryContentTitle.value.trim();
  if (!title) {
    elements.libraryContentError.textContent = "请填写事件内容。";
    elements.libraryContentTitle.focus();
    return;
  }

  const result = updateEventContent(state.eventContents, elements.libraryContentId.value, {
    title,
    category: elements.libraryContentCategory.value,
    favorite: elements.libraryContentFavorite.checked,
    color: new FormData(elements.libraryContentForm).get("libraryContentColor"),
  });
  if (!result) {
    elements.libraryContentError.textContent = "已有同名且同分类的事件内容。";
    return;
  }

  state.eventContents = result.contents;
  saveState();
  renderEventContents();
  renderDataSummary();
  elements.libraryContentDialog.close();
  showToast(result.content.favorite ? "常用项已更新" : "已移出常用项");
}

function completeTimelineSelection(dateKey, point) {
  elements.timeline.classList.remove("selecting");
  if (!activeSelection) return;
  if (hasConflict(activeSelection, blocksForDate(dateKey))) {
    clearTimelineSelection();
    showToast("这段时间已有安排，请在空白处重新划选");
    return;
  }
  showActionPicker(point);
}

function startTimelineSelection(event) {
  if (event.pointerType === "touch" || event.button !== 0 || event.target.closest(".time-block") || event.target.closest("button")) return;
  const dayColumn = event.target.closest(".day-column");
  if (!dayColumn) return;
  const dateKey = dayColumn.dataset.date;

  clearTimelineSelection();
  event.preventDefault();
  const anchor = minuteAtPointer(event.clientY);
  elements.timeline.setPointerCapture(event.pointerId);
  elements.timeline.classList.add("selecting");
  renderDraftSelection(dateKey, selectionRange(anchor, anchor, DAY_START, DAY_END));

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    renderDraftSelection(dateKey, selectionRange(anchor, minuteAtPointer(moveEvent.clientY), DAY_START, DAY_END));
  };
  const finish = (upEvent) => {
    elements.timeline.removeEventListener("pointermove", move);
    elements.timeline.removeEventListener("pointerup", finish);
    elements.timeline.removeEventListener("pointercancel", cancel);
    completeTimelineSelection(dateKey, { x: upEvent.clientX, y: upEvent.clientY });
  };
  const cancel = () => {
    elements.timeline.removeEventListener("pointermove", move);
    elements.timeline.removeEventListener("pointerup", finish);
    clearTimelineSelection();
  };

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
  const dayColumn = event.target.closest(".day-column");
  const touch = event.touches[0];
  if (!dayColumn || !touch) return;

  clearPendingTouchSelection(true);
  clearTimelineSelection();
  const pending = {
    active: false,
    anchor: minuteAtPointer(touch.clientY),
    dateKey: dayColumn.dataset.date,
    identifier: touch.identifier,
    origin: { x: touch.clientX, y: touch.clientY },
    scrollPosition: readTimelineScrollPosition(),
    timer: null,
  };
  pending.timer = setTimeout(() => {
    if (touchSelection !== pending) return;
    pending.active = true;
    suppressContextMenuUntil = Date.now() + 1200;
    elements.timeline.classList.add("selecting");
    setTouchScrollLock(true, pending.scrollPosition);
    renderDraftSelection(pending.dateKey, selectionRange(pending.anchor, pending.anchor, DAY_START, DAY_END));
    if (navigator.vibrate) navigator.vibrate(8);
  }, LONG_PRESS_DELAY);
  touchSelection = pending;
}

function moveTouchTimelineSelection(event) {
  if (!touchSelection) return;
  const touch = touchById(event.touches, touchSelection.identifier);
  if (!touch) return;
  if (!touchSelection.active) {
    if (hasMovedBeyondTolerance(touchSelection.origin, { x: touch.clientX, y: touch.clientY }, LONG_PRESS_MOVE_TOLERANCE)) {
      clearPendingTouchSelection();
    }
    return;
  }

  event.preventDefault();
  if (!usesPageTimelineScroll()) restoreTimelineScrollPosition(touchSelection.scrollPosition);
  renderDraftSelection(
    touchSelection.dateKey,
    selectionRange(touchSelection.anchor, minuteAtPointer(touch.clientY), DAY_START, DAY_END),
  );
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

function cancelTouchTimelineSelection() {
  clearPendingTouchSelection(true);
}

function startPointerAdjustment(event) {
  if (event.button !== 0 || event.target.closest("button")) return;
  const article = event.currentTarget;
  const dateKey = article.dataset.date;
  const block = blocksForDate(dateKey).find((item) => item.id === article.dataset.id);
  if (!block) return;
  const resizing = Boolean(event.target.closest(".resize-handle"));
  const originY = event.clientY;
  let deltaMinutes = 0;
  article.setPointerCapture(event.pointerId);
  article.classList.add("dragging");

  const move = (moveEvent) => {
    deltaMinutes = Math.round(((moveEvent.clientY - originY) / PIXELS_PER_MINUTE) / 5) * 5;
    if (resizing) {
      const previewEnd = Math.max(block.start + 15, Math.min(DAY_END, block.end + deltaMinutes));
      article.style.height = `${(previewEnd - block.start) * PIXELS_PER_MINUTE}px`;
    } else {
      const duration = block.end - block.start;
      const previewStart = Math.max(DAY_START, Math.min(DAY_END - duration, block.start + deltaMinutes));
      article.style.top = `${(previewStart - DAY_START) * PIXELS_PER_MINUTE}px`;
    }
  };

  const finish = () => {
    article.classList.remove("dragging");
    article.removeEventListener("pointermove", move);
    article.removeEventListener("pointerup", finish);
    article.removeEventListener("pointercancel", cancel);
    if (deltaMinutes === 0) return;
    ignoreBlockClickUntil = Date.now() + 250;
    let candidate;
    if (resizing) {
      candidate = { ...block, end: Math.max(block.start + 15, Math.min(DAY_END, block.end + deltaMinutes)) };
    } else {
      const duration = block.end - block.start;
      const start = Math.max(DAY_START, Math.min(DAY_END - duration, block.start + deltaMinutes));
      candidate = { ...block, start, end: start + duration };
    }
    if (hasConflict(candidate, blocksForDate(dateKey), block.id)) {
      renderBlocks();
      showToast("这里已有安排，时间块已放回原位");
      return;
    }
    setBlocksForDate(dateKey, blocksForDate(dateKey).map((item) => item.id === block.id ? candidate : item));
    saveState();
    renderAll();
    showToast(resizing ? "时长已调整" : `已移动到 ${formatTime(candidate.start)}`);
  };

  const cancel = () => {
    article.classList.remove("dragging");
    renderBlocks();
  };

  article.addEventListener("pointermove", move);
  article.addEventListener("pointerup", finish);
  article.addEventListener("pointercancel", cancel, { once: true });
}

document.addEventListener("click", (event) => {
  const editContentButton = event.target.closest("[data-edit-event-content]");
  if (editContentButton) {
    openLibraryContentEditor(editContentButton.dataset.editEventContent);
    return;
  }
  const contentButton = event.target.closest("[data-event-content-id]");
  if (contentButton) {
    const content = state.eventContents.find((item) => item.id === contentButton.dataset.eventContentId);
    if (content) createBlockFromContent(content);
    return;
  }
  const applyButton = event.target.closest("[data-apply-rule]");
  if (applyButton) applyRule(applyButton.dataset.applyRule);
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-toggle-rule]")) toggleRule(event.target.dataset.toggleRule, event.target.checked);
});

document.addEventListener("pointerdown", (event) => {
  if (!elements.actionPicker.hidden && !elements.actionPicker.contains(event.target) && !event.target.closest(".timeline")) {
    clearTimelineSelection();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.actionPicker.hidden) clearTimelineSelection();
});

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-view-days]").forEach((button) => button.addEventListener("click", () => changeViewDayCount(Number(button.dataset.viewDays))));
elements.previousRangeButton.addEventListener("click", () => changeVisibleRange(-1));
elements.nextRangeButton.addEventListener("click", () => changeVisibleRange(1));
document.querySelector("#todayButton").addEventListener("click", goToToday);
document.querySelector("#closeActionPicker").addEventListener("click", clearTimelineSelection);
elements.newContentButton.addEventListener("click", openContentForm);
elements.cancelContentButton.addEventListener("click", () => showContentList(true));
document.querySelector("#newRuleButton").addEventListener("click", openRuleDialog);
elements.exportDataButton.addEventListener("click", exportData);
elements.importDataButton.addEventListener("click", () => elements.importDataFile.click());
elements.importDataFile.addEventListener("change", importData);
elements.contentForm.addEventListener("submit", saveEventContent);
elements.libraryContentForm.addEventListener("submit", saveLibraryContent);
elements.closeLibraryContentButton.addEventListener("click", () => elements.libraryContentDialog.close());
elements.cancelLibraryContentButton.addEventListener("click", () => elements.libraryContentDialog.close());
elements.blockForm.addEventListener("submit", saveBlock);
elements.deleteBlockButton.addEventListener("click", deleteBlock);
elements.ruleForm.addEventListener("submit", saveRule);
elements.clearDoneButton.addEventListener("click", () => {
  const keys = visibleDateKeys();
  const completed = keys.flatMap((dateKey) => blocksForDate(dateKey)).filter((block) => block.done).length;
  if (!completed) {
    showToast("当前范围没有已完成项");
    return;
  }
  keys.forEach((dateKey) => setBlocksForDate(dateKey, blocksForDate(dateKey).filter((block) => !block.done)));
  saveState();
  renderAll();
  showToast(`已清理 ${completed} 个完成项`);
});
elements.timeline.addEventListener("pointerdown", startTimelineSelection);
elements.timeline.addEventListener("touchstart", startTouchTimelineSelection, { passive: true });
elements.timeline.addEventListener("touchmove", moveTouchTimelineSelection, { passive: false });
elements.timeline.addEventListener("touchend", finishTouchTimelineSelection, { passive: false });
elements.timeline.addEventListener("touchcancel", cancelTouchTimelineSelection);
elements.timeline.addEventListener("contextmenu", (event) => {
  if (Date.now() < suppressContextMenuUntil && event.target.closest(".day-column")) event.preventDefault();
});
window.addEventListener("resize", positionActionPicker);
window.addEventListener("hashchange", () => {
  const viewName = window.location.hash.slice(1);
  if (["today", "recurring", "data"].includes(viewName)) switchView(viewName);
});

buildDayOptions();
renderAll();
goToToday();
const initialView = window.location.hash.slice(1);
if (["recurring", "data"].includes(initialView)) switchView(initialView);
setInterval(() => {
  const freshNow = new Date();
  if (toDateKey(freshNow) !== todayDateKey) {
    window.location.reload();
    return;
  }
  now = freshNow;
  const nowLine = elements.timelineDays.querySelector(`[data-date="${todayDateKey}"] .now-line`);
  if (nowLine) nowLine.style.top = `${(now.getHours() * 60 + now.getMinutes()) * PIXELS_PER_MINUTE}px`;
}, 60_000);
