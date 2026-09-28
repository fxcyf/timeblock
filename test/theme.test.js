import test from "node:test";
import assert from "node:assert/strict";

import {
  COLOR_PRESETS,
  accentColorTokens,
  contrastRatio,
  eventColorTokens,
  normalizeColorValue,
  resolveColor,
} from "../src/theme.js";

test("normalizes custom colors and falls back from unsafe values", () => {
  assert.equal(normalizeColorValue("#A1B2C3"), "#a1b2c3");
  assert.equal(normalizeColorValue("url(javascript:bad)", "#b96d4e"), "#b96d4e");
  assert.equal(resolveColor("sage"), "#6f8b73");
});

test("builds readable theme tokens for light and dark accents", () => {
  for (const accent of ["#285c4d", "#e7c7a1", "#ffffff", "#111111"]) {
    const tokens = accentColorTokens(accent);
    assert.ok(contrastRatio(tokens.accent, tokens.onAccent) >= 4.5);
    assert.ok(contrastRatio(tokens.accent, "#ffffff") >= 3);
    assert.ok(contrastRatio(tokens.strong, "#ffffff") >= 4.5);
    assert.match(tokens.soft, /^#[0-9a-f]{6}$/);
    assert.match(tokens.focus, /^#[0-9a-f]{6}$/);
  }
});

test("derives a consistent and readable role set for every event color", () => {
  for (const color of [...Object.values(COLOR_PRESETS), "#ffffff", "#050505", "#ffea00", "#00ff00", "#00ffff", "#ff00ff"]) {
    const tokens = eventColorTokens(color);
    assert.ok(contrastRatio(tokens.text, tokens.surface) >= 7);
    assert.ok(contrastRatio(tokens.marker, "#ffffff") >= 3);
    assert.match(tokens.surface, /^#[0-9a-f]{6}$/);
    assert.match(tokens.border, /^#[0-9a-f]{6}$/);
  }
});
