function cleanText(value) {
  return String(value ?? "").trim();
}

export function validateRuleDraft(draft) {
  const errors = {};
  if (!cleanText(draft?.title)) errors.ruleTitle = "请输入日程名称";
  if (!Number.isInteger(draft?.start) || draft.start < 0 || draft.start >= 1440) errors.ruleStart = "请选择有效的开始时间";
  if (!Number.isInteger(draft?.duration) || draft.duration <= 0 || (Number.isInteger(draft?.start) && draft.start + draft.duration > 1440)) errors.ruleDuration = "请选择有效的持续时间";
  if (!Array.isArray(draft?.days) || !draft.days.length || draft.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) errors.ruleDays = "至少选择一天";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft?.startDate || "")) errors.ruleStartDate = "请选择生效日期";
  if (draft?.endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endDate) || draft.endDate < draft.startDate)) errors.ruleEndDate = "结束日期不能早于生效日期";
  return { errors, firstField: Object.keys(errors)[0] || null };
}
