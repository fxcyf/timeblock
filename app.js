import {
  findNextFreeSlot,
  formatDuration,
  formatTime,
  hasConflict,
  materializeRecurring,
  occursOnDate,
  parseQuickEntry,
  parseTime,
  recurringRulesConflict,
  selectionRange,
  sortBlocks,
} from "./src/schedule.js";

const DAY_START = 18 * 60 + 30;
const DAY_END = 23 * 60 + 30;
const PIXELS_PER_MINUTE = 2;
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

let now = new Date();
const dateKey = toDateKey(now);
let state = loadState();
let defaultDuration = 45;
let toastTimer;
let ignoreBlockClickUntil = 0;
let activeSelection = null;
let selectionPoint = null;

const elements = {
  actionPicker: document.querySelector("#actionPicker"),
  blockDialog: document.querySelector("#blockDialog"),
  blockDialogKicker: document.querySelector("#blockDialogKicker"),
  blockDialogTitle: document.querySelector("#blockDialogTitle"),
  blockEnd: document.querySelector("#blockEnd"),
  blockError: document.querySelector("#blockError"),
  blockForm: document.querySelector("#blockForm"),
  blockId: document.querySelector("#blockId"),
  blockStart: document.querySelector("#blockStart"),
  blockTitle: document.querySelector("#blockTitle"),
  blocksLayer: document.querySelector("#blocksLayer"),
  clearDoneButton: document.querySelector("#clearDoneButton"),
  dateEyebrow: document.querySelector("#dateEyebrow"),
  dayOptions: document.querySelector("#dayOptions"),
  deleteBlockButton: document.querySelector("#deleteBlockButton"),
  draftSelection: document.querySelector("#draftSelection"),
  nowLine: document.querySelector("#nowLine"),
  progressBar: document.querySelector("#progressBar"),
  quickForm: document.querySelector("#quickForm"),
  quickInput: document.querySelector("#quickInput"),
  recurringView: document.querySelector("#recurringView"),
  ruleCount: document.querySelector("#ruleCount"),
  ruleDialog: document.querySelector("#ruleDialog"),
  ruleError: document.querySelector("#ruleError"),
  ruleForm: document.querySelector("#ruleForm"),
  ruleList: document.querySelector("#ruleList"),
  scheduleProgress: document.querySelector("#scheduleProgress"),
  selectedRange: document.querySelector("#selectedRange"),
  selectionTime: document.querySelector("#selectionTime"),
  timeAxis: document.querySelector("#timeAxis"),
  timeline: document.querySelector("#timeline"),
  timelineGrid: document.querySelector("#timelineGrid"),
  toast: document.querySelector("#toast"),
  tonightRules: document.querySelector("#tonightRules"),
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

function seedBlocks(rules) {
  const recurringBlocks = materializeRecurring(rules, now);
  const windDown = {
    id: `block-wind-down-${dateKey}`,
    title: "洗澡 & 准备明天",
    start: 22 * 60 + 10,
    end: 22 * 60 + 40,
    color: "lilac",
    done: false,
  };
  return hasConflict(windDown, recurringBlocks) ? recurringBlocks : [...recurringBlocks, windDown];
}

function loadState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    saved = null;
  }

  const rules = Array.isArray(saved?.rules) ? saved.rules : defaultRules;
  if (saved?.date === dateKey && Array.isArray(saved.blocks)) {
    return { date: dateKey, rules, blocks: saved.blocks };
  }
  return { date: dateKey, rules, blocks: seedBlocks(rules) };
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

function renderDate() {
  const month = now.getMonth() + 1;
  const date = now.getDate();
  elements.dateEyebrow.textContent = `${month}月${date}日 · ${FULL_DAY_NAMES[now.getDay()]}`;
}

function renderTimelineFrame() {
  const totalMinutes = DAY_END - DAY_START;
  elements.timeline.style.height = `${totalMinutes * PIXELS_PER_MINUTE}px`;
  elements.timeAxis.innerHTML = "";
  elements.timelineGrid.innerHTML = "";

  for (let minute = DAY_START; minute <= DAY_END; minute += 30) {
    const offset = (minute - DAY_START) * PIXELS_PER_MINUTE;
    const label = document.createElement("span");
    label.className = "axis-label";
    if (minute === DAY_START) label.classList.add("edge-start");
    if (minute === DAY_END) label.classList.add("edge-end");
    label.style.top = `${offset}px`;
    label.textContent = minute % 60 === 0 || minute === DAY_START || minute === DAY_END ? formatTime(minute) : "· 30";
    elements.timeAxis.append(label);

    const line = document.createElement("span");
    line.className = `grid-line${minute % 60 ? " half" : ""}`;
    line.style.top = `${offset}px`;
    elements.timelineGrid.append(line);
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (currentMinutes >= DAY_START && currentMinutes <= DAY_END) {
    elements.nowLine.hidden = false;
    elements.nowLine.style.top = `${(currentMinutes - DAY_START) * PIXELS_PER_MINUTE}px`;
  } else {
    elements.nowLine.hidden = true;
  }
}

function renderBlocks() {
  elements.blocksLayer.innerHTML = "";
  for (const block of sortBlocks(state.blocks)) {
    if (block.end <= DAY_START || block.start >= DAY_END) continue;
    const article = document.createElement("article");
    article.className = `time-block ${block.color || "apricot"}${block.done ? " done" : ""}`;
    article.dataset.id = block.id;
    article.style.top = `${(block.start - DAY_START) * PIXELS_PER_MINUTE}px`;
    article.style.height = `${(block.end - block.start) * PIXELS_PER_MINUTE}px`;
    article.setAttribute("tabindex", "0");
    article.setAttribute("role", "button");
    article.setAttribute("aria-label", `${block.title}，${formatTime(block.start)} 到 ${formatTime(block.end)}，点击编辑`);
    article.innerHTML = `
      <span class="block-time">${formatTime(block.start)} — ${formatTime(block.end)}</span>
      <strong class="block-title">${escapeHtml(block.title)}</strong>
      <button class="block-check" aria-label="${block.done ? "标记为未完成" : "标记为已完成"}"><svg><use href="#icon-check"></use></svg></button>
      <span class="resize-handle" aria-hidden="true"></span>
    `;
    article.addEventListener("click", (event) => {
      if (Date.now() < ignoreBlockClickUntil || event.target.closest(".block-check")) return;
      openBlockDialog(block.id);
    });
    article.addEventListener("keydown", (event) => {
      if (event.target !== article) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openBlockDialog(block.id);
      }
    });
    article.querySelector(".block-check").addEventListener("click", (event) => {
      event.stopPropagation();
      toggleDone(block.id);
    });
    article.addEventListener("pointerdown", startPointerAdjustment);
    elements.blocksLayer.append(article);
  }
}

function renderOverview() {
  const scheduled = state.blocks.reduce((total, block) => total + Math.max(0, block.end - block.start), 0);
  const available = DAY_END - DAY_START;
  const free = Math.max(0, available - scheduled);
  const ratio = Math.min(100, Math.round((scheduled / available) * 100));
  elements.progressBar.style.width = `${ratio}%`;
  elements.scheduleProgress.setAttribute("aria-valuenow", String(ratio));
  elements.scheduleProgress.setAttribute("aria-valuetext", `已安排 ${formatDuration(scheduled)}，留白 ${formatDuration(free)}`);
}

function renderTonightRules() {
  const tonight = state.rules.filter((rule) => occursOnDate(rule, now));
  if (!tonight.length) {
    elements.tonightRules.innerHTML = '<p class="empty-rules" aria-label="今晚没有重复日程">—</p>';
    return;
  }
  elements.tonightRules.innerHTML = tonight.map((rule) => {
    const added = state.blocks.some((block) => block.sourceRuleId === rule.id);
    return `<div class="mini-rule" style="--rule-color:${COLOR_VALUES[rule.color]}">
      <span class="mini-rule-dot"></span>
      <span><strong>${escapeHtml(rule.title)}</strong><small>${formatTime(rule.start)} · ${formatDuration(rule.duration)}</small></span>
      <button data-apply-rule="${rule.id}" aria-label="${added ? "已安排" : `将${escapeHtml(rule.title)}加入今晚`}" ${added ? "disabled" : ""}><svg><use href="#icon-${added ? "check" : "plus"}"></use></svg></button>
    </div>`;
  }).join("");
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
    days.push(`<div class="week-day${toDateKey(date) === dateKey ? " today" : ""}">
      <span>${FULL_DAY_NAMES[date.getDay()]}</span><strong>${date.getDate()}</strong>
      <div class="week-marks">${matching.map((rule) => `<i style="--mark-color:${COLOR_VALUES[rule.color]}"></i>`).join("")}</div>
    </div>`);
  }
  elements.weekStrip.innerHTML = days.join("");
}

function renderRuleList() {
  elements.ruleCount.textContent = state.rules.length;
  elements.ruleList.innerHTML = state.rules.map((rule) => {
    const added = state.blocks.some((block) => block.sourceRuleId === rule.id);
    return `<article class="rule-card${rule.enabled ? "" : " disabled"}" style="--rule-color:${COLOR_VALUES[rule.color]}">
      <span class="rule-color"></span>
      <div class="rule-main"><strong>${escapeHtml(rule.title)}</strong><span class="rule-meta"><svg><use href="#icon-clock"></use></svg>${formatTime(rule.start)} · ${formatDuration(rule.duration)}</span></div>
      <div class="day-chips" aria-label="重复日期">${DAY_ORDER.map((day) => `<span class="${rule.days.includes(day) ? "on" : ""}">${DAY_NAMES[day]}</span>`).join("")}</div>
      <button class="rule-add" data-apply-rule="${rule.id}" aria-label="${added ? "今晚已安排" : `将${escapeHtml(rule.title)}加入今晚`}" ${added || !rule.enabled ? "disabled" : ""}><svg><use href="#icon-${added ? "check" : "plus"}"></use></svg></button>
      <label class="switch" aria-label="${rule.enabled ? "停用" : "启用"}${escapeHtml(rule.title)}"><input type="checkbox" data-toggle-rule="${rule.id}" ${rule.enabled ? "checked" : ""} /><span></span></label>
    </article>`;
  }).join("");
}

function renderAll() {
  renderBlocks();
  renderOverview();
  renderTonightRules();
  renderWeekStrip();
  renderRuleList();
}

function openBlockDialog(id = null, draftOverride = null) {
  if (!draftOverride) clearTimelineSelection();
  elements.blockError.textContent = "";
  elements.blockId.value = id || "";
  const existing = id ? state.blocks.find((block) => block.id === id) : null;
  let draft = existing || draftOverride;
  if (!draft) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const requested = currentMinutes >= DAY_START && currentMinutes < DAY_END
      ? Math.ceil(currentMinutes / 5) * 5
      : DAY_START;
    const slot = findNextFreeSlot(state.blocks, requested, defaultDuration, DAY_START, DAY_END)
      || { start: DAY_START, end: DAY_START + defaultDuration };
    draft = { title: "", start: slot.start, end: slot.end, color: "apricot" };
  }
  elements.blockDialogKicker.textContent = existing ? "时间块" : "新的时间块";
  elements.blockDialogTitle.textContent = existing ? "编辑今晚的安排" : "把一件事放进今晚";
  elements.blockTitle.value = draft.title;
  elements.blockStart.value = formatTime(draft.start);
  elements.blockEnd.value = formatTime(draft.end);
  elements.deleteBlockButton.hidden = !existing;
  const colorRadio = elements.blockForm.querySelector(`[name="blockColor"][value="${draft.color || "apricot"}"]`);
  if (colorRadio) colorRadio.checked = true;
  elements.blockDialog.showModal();
  setTimeout(() => elements.blockTitle.focus(), 50);
}

function saveBlock(event) {
  event.preventDefault();
  const start = parseTime(elements.blockStart.value);
  const end = parseTime(elements.blockEnd.value);
  const id = elements.blockId.value || `block-${Date.now()}`;
  const existing = state.blocks.find((block) => block.id === id);
  const candidate = {
    ...existing,
    id,
    title: elements.blockTitle.value.trim(),
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
    elements.blockError.textContent = `请选择 ${formatTime(DAY_START)} 到 ${formatTime(DAY_END)} 之间的有效时段。`;
    return;
  }
  if (hasConflict(candidate, state.blocks, id)) {
    elements.blockError.textContent = "这个时段和已有安排重叠了，换个时间试试。";
    return;
  }

  state.blocks = existing
    ? state.blocks.map((block) => block.id === id ? candidate : block)
    : [...state.blocks, candidate];
  saveState();
  renderAll();
  elements.blockDialog.close();
  showToast(existing ? "时间块已更新" : "已放进今晚");
}

function deleteBlock() {
  const id = elements.blockId.value;
  if (!id) return;
  state.blocks = state.blocks.filter((block) => block.id !== id);
  saveState();
  renderAll();
  elements.blockDialog.close();
  showToast("已从今晚移除");
}

function toggleDone(id) {
  state.blocks = state.blocks.map((block) => block.id === id ? { ...block, done: !block.done } : block);
  saveState();
  renderAll();
  const block = state.blocks.find((item) => item.id === id);
  showToast(block.done ? "完成一项，做得不错" : "已恢复为待完成");
}

function addQuickBlock(title, duration, explicitStart = null) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const requested = explicitStart ?? (
    currentMinutes >= DAY_START && currentMinutes < DAY_END
      ? Math.ceil(currentMinutes / 5) * 5
      : DAY_START
  );
  let slot;
  if (explicitStart !== null) {
    const candidate = { start: explicitStart, end: explicitStart + duration };
    if (candidate.start < DAY_START || candidate.end > DAY_END) {
      showToast(`今晚可安排的时间是 ${formatTime(DAY_START)}—${formatTime(DAY_END)}`);
      return false;
    }
    if (hasConflict(candidate, state.blocks)) {
      showToast(`${formatTime(explicitStart)} 已有安排，请换个时间`);
      return false;
    }
    slot = candidate;
  } else {
    slot = findNextFreeSlot(state.blocks, requested, duration, DAY_START, DAY_END);
  }
  if (!slot) {
    showToast("今晚没有足够的连续空档了，先调整一下时间块吧");
    return false;
  }

  const color = /运动|健身|跑步/.test(title) ? "sage"
    : /读|学习|写/.test(title) ? "blue"
      : /洗澡|明天|整理/.test(title) ? "lilac" : "apricot";
  state.blocks.push({ id: `block-${Date.now()}`, title, ...slot, color, done: false });
  saveState();
  renderAll();
  showToast(`已安排在 ${formatTime(slot.start)}`);
  return true;
}

function submitQuickEntry(event) {
  event.preventDefault();
  const parsed = parseQuickEntry(elements.quickInput.value, defaultDuration);
  if (!parsed) {
    elements.quickInput.focus();
    showToast("先写下今晚想做的事");
    return;
  }
  if (addQuickBlock(parsed.title, parsed.duration, parsed.start)) elements.quickInput.value = "";
}

function applyRule(ruleId) {
  const rule = state.rules.find((item) => item.id === ruleId);
  if (!rule || !rule.enabled) return;
  if (state.blocks.some((block) => block.sourceRuleId === rule.id)) {
    showToast("这个重复日程已经在今晚了");
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
  if (hasConflict(candidate, state.blocks)) {
    showToast("这个时间已有安排，先调整一下时间轴吧");
    return;
  }
  state.blocks.push(candidate);
  saveState();
  renderAll();
  showToast("重复日程已加入今晚");
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

function switchView(viewName) {
  const isToday = viewName === "today";
  if (!isToday) clearTimelineSelection();
  elements.todayView.classList.toggle("active", isToday);
  elements.todayView.hidden = !isToday;
  elements.recurringView.classList.toggle("active", !isToday);
  elements.recurringView.hidden = isToday;
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  elements.viewTitle.textContent = isToday ? "今晚" : "重复";
  elements.clearDoneButton.hidden = !isToday;
  window.location.hash = viewName;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function minuteAtPointer(clientY) {
  const timelineRect = elements.timeline.getBoundingClientRect();
  const minute = DAY_START + (clientY - timelineRect.top) / PIXELS_PER_MINUTE;
  return Math.max(DAY_START, Math.min(DAY_END, minute));
}

function renderDraftSelection(range) {
  const conflict = hasConflict(range, state.blocks);
  activeSelection = range;
  elements.draftSelection.hidden = false;
  elements.draftSelection.style.top = `${(range.start - DAY_START) * PIXELS_PER_MINUTE}px`;
  elements.draftSelection.style.height = `${(range.end - range.start) * PIXELS_PER_MINUTE}px`;
  elements.draftSelection.classList.toggle("invalid", conflict);
  elements.draftSelection.classList.toggle("compact", range.end - range.start <= 15);
  elements.selectionTime.textContent = `${formatTime(range.start)} — ${formatTime(range.end)}`;
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

function showActionPicker(point) {
  if (!activeSelection) return;
  selectionPoint = point;
  elements.selectedRange.textContent = `${formatTime(activeSelection.start)} — ${formatTime(activeSelection.end)}`;
  elements.actionPicker.hidden = false;
  positionActionPicker();
  elements.actionPicker.querySelector("[data-selection-action]")?.focus({ preventScroll: true });
}

function clearTimelineSelection() {
  activeSelection = null;
  selectionPoint = null;
  elements.draftSelection.hidden = true;
  elements.draftSelection.classList.remove("invalid", "compact");
  elements.actionPicker.hidden = true;
  elements.actionPicker.style.removeProperty("left");
  elements.actionPicker.style.removeProperty("top");
  elements.timeline.classList.remove("selecting");
}

function createBlockFromSelection(title, color) {
  if (!activeSelection) return;
  const range = { ...activeSelection };
  if (hasConflict(range, state.blocks)) {
    clearTimelineSelection();
    showToast("这段时间已有安排，请重新划选");
    return;
  }
  state.blocks.push({
    id: `block-${Date.now()}`,
    title,
    start: range.start,
    end: range.end,
    color,
    done: false,
  });
  clearTimelineSelection();
  saveState();
  renderAll();
  showToast(`${formatTime(range.start)}—${formatTime(range.end)} 已安排「${title}」`);
}

function openCustomSelection() {
  if (!activeSelection) return;
  const draft = { ...activeSelection, title: "", color: "apricot" };
  clearTimelineSelection();
  openBlockDialog(null, draft);
}

function startTimelineSelection(event) {
  if (event.button !== 0 || event.target.closest(".time-block") || event.target.closest("button")) return;
  const gridRect = elements.timelineGrid.getBoundingClientRect();
  if (event.clientX < gridRect.left || event.clientX > gridRect.right) return;

  clearTimelineSelection();
  event.preventDefault();
  const anchor = minuteAtPointer(event.clientY);
  elements.timeline.setPointerCapture(event.pointerId);
  elements.timeline.classList.add("selecting");
  renderDraftSelection(selectionRange(anchor, anchor, DAY_START, DAY_END));

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    renderDraftSelection(selectionRange(anchor, minuteAtPointer(moveEvent.clientY), DAY_START, DAY_END));
  };
  const finish = (upEvent) => {
    elements.timeline.removeEventListener("pointermove", move);
    elements.timeline.removeEventListener("pointerup", finish);
    elements.timeline.removeEventListener("pointercancel", cancel);
    elements.timeline.classList.remove("selecting");
    if (!activeSelection) return;
    if (hasConflict(activeSelection, state.blocks)) {
      clearTimelineSelection();
      showToast("这段时间已有安排，请在空白处重新划选");
      return;
    }
    showActionPicker({ x: upEvent.clientX, y: upEvent.clientY });
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

function guideToTimeline() {
  switchView("today");
  document.querySelector(".timeline-card").scrollIntoView({ behavior: "smooth", block: "start" });
  elements.timeline.classList.remove("selection-ready");
  requestAnimationFrame(() => elements.timeline.classList.add("selection-ready"));
  setTimeout(() => elements.timeline.classList.remove("selection-ready"), 900);
  showToast("在空白时间上按住，并上下滑动");
}

function startPointerAdjustment(event) {
  if (event.button !== 0 || event.target.closest("button")) return;
  const article = event.currentTarget;
  const block = state.blocks.find((item) => item.id === article.dataset.id);
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
    if (hasConflict(candidate, state.blocks, block.id)) {
      renderBlocks();
      showToast("这里已有安排，时间块已放回原位");
      return;
    }
    state.blocks = state.blocks.map((item) => item.id === block.id ? candidate : item);
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
document.querySelectorAll("[data-duration]").forEach((button) => {
  if (button.closest(".duration-row")) {
    button.addEventListener("click", () => {
      defaultDuration = Number(button.dataset.duration);
      document.querySelectorAll(".duration-row [data-duration]").forEach((item) => item.classList.toggle("active", item === button));
    });
  }
});
document.querySelectorAll(".suggestions button").forEach((button) => button.addEventListener("click", () => addQuickBlock(button.dataset.title, Number(button.dataset.duration))));
document.querySelectorAll("[data-selection-action]").forEach((button) => button.addEventListener("click", () => createBlockFromSelection(button.dataset.selectionAction, button.dataset.color)));
document.querySelector("#openAddButton").addEventListener("click", () => openBlockDialog());
document.querySelector("#mobileAddButton").addEventListener("click", guideToTimeline);
document.querySelector("#closeActionPicker").addEventListener("click", clearTimelineSelection);
document.querySelector("#customSelectionAction").addEventListener("click", openCustomSelection);
document.querySelector("#manageRulesButton").addEventListener("click", () => switchView("recurring"));
document.querySelector("#newRuleButton").addEventListener("click", openRuleDialog);
elements.quickForm.addEventListener("submit", submitQuickEntry);
elements.blockForm.addEventListener("submit", saveBlock);
elements.deleteBlockButton.addEventListener("click", deleteBlock);
elements.ruleForm.addEventListener("submit", saveRule);
elements.clearDoneButton.addEventListener("click", () => {
  const completed = state.blocks.filter((block) => block.done).length;
  if (!completed) {
    showToast("今晚还没有已完成的时间块");
    return;
  }
  state.blocks = state.blocks.filter((block) => !block.done);
  saveState();
  renderAll();
  showToast(`已清理 ${completed} 个完成项`);
});
elements.timeline.addEventListener("pointerdown", startTimelineSelection);
window.addEventListener("resize", positionActionPicker);

renderDate();
renderTimelineFrame();
buildDayOptions();
renderAll();
if (window.location.hash === "#recurring") switchView("recurring");
setInterval(() => {
  const freshNow = new Date();
  if (toDateKey(freshNow) !== dateKey) {
    window.location.reload();
    return;
  }
  now = freshNow;
  renderTimelineFrame();
  renderOverview();
}, 60_000);
