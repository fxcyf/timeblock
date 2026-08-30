import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateRuleDraft } from "../src/forms.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("repeat dialog cancel controls never submit or invoke native validation", () => {
  for (const id of ["closeRuleButton", "cancelRuleButton", "deleteRuleButton"]) {
    const button = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(button, `${id} should exist`);
    assert.match(button, /type="button"/);
  }
  assert.match(html.match(/<form[^>]*id="ruleForm"[^>]*>/)?.[0] || "", /novalidate/);
});

test("time-block dialog close and cancel controls are also non-submitting", () => {
  for (const id of ["closeBlockButton", "cancelBlockButton", "deleteBlockButton"]) {
    const button = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(button, `${id} should exist`);
    assert.match(button, /type="button"/);
  }
});

test("validates repeat drafts only on explicit save", () => {
  const empty = validateRuleDraft({ title: "", start: null, duration: 0, days: [], startDate: "", endDate: null });
  assert.equal(empty.firstField, "ruleTitle");
  assert.ok(empty.errors.ruleTitle);
  assert.ok(empty.errors.ruleDays);
  assert.deepEqual(validateRuleDraft({ title: "阅读", start: 1200, duration: 30, days: [1], startDate: "2026-08-30", endDate: null }), { errors: {}, firstField: null });
});
