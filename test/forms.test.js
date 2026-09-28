import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveCategoryChoice, validateRuleDraft } from "../src/forms.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("schedule blocks do not expose completion controls", () => {
  assert.doesNotMatch(html, /clearDoneButton|icon-check/);
  assert.doesNotMatch(app, /block-check|toggleDone|clearDoneButton/);
  assert.doesNotMatch(css, /block-check|time-block\.done/);
});

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

test("new event content supports automatic, preset, and custom colors", () => {
  assert.match(html, /name="contentColor" value="auto"[^>]*checked/);
  assert.match(html, /name="contentColor" value="apricot"/);
  assert.match(html, /id="contentCustomColor" type="color"/);
  assert.match(app, /selectedContentColor === "auto"/);
  assert.match(app, /readColorChoice\(elements\.contentForm, "contentColor", elements\.contentCustomColor\)/);
  assert.match(css, /\.custom-color-option > input\[type="color"\] \{[^}]*position: static;[^}]*opacity: 1;/);
});

test("new event content offers existing categories and a new-category choice", () => {
  assert.match(html, /<select id="contentCategory"/);
  assert.match(html, /<select id="libraryContentCategory"/);
  assert.match(html, /id="contentNewCategory"[^>]*maxlength="20"/);
  assert.match(html, /id="libraryContentNewCategory"[^>]*maxlength="20"/);
  assert.match(html, /data-new-category/);
  assert.match(app, /elements\.contentCategory\.addEventListener\("change"/);
  assert.match(app, /elements\.libraryContentCategory\.addEventListener\("change"/);
  assert.equal(resolveCategoryChoice("健康", "", false), "健康");
  assert.equal(resolveCategoryChoice("", "  新分类  ", true), "新分类");
});

test("event content names open their settings without requiring the arrow", () => {
  assert.match(app, /class="content-library-open" data-edit-event-content=/);
  assert.match(css, /\.content-library-open \{[^}]*cursor: pointer;/);
});

test("validates repeat drafts only on explicit save", () => {
  const empty = validateRuleDraft({ title: "", start: null, duration: 0, days: [], startDate: "", endDate: null });
  assert.equal(empty.firstField, "ruleTitle");
  assert.ok(empty.errors.ruleTitle);
  assert.ok(empty.errors.ruleDays);
  assert.deepEqual(validateRuleDraft({ title: "阅读", start: 1200, duration: 30, days: [1], startDate: "2026-08-30", endDate: null }), { errors: {}, firstField: null });
});
