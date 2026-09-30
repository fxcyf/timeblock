import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCENT_COLOR_PRESETS,
  COLOR_PRESETS,
  CUSTOM_COLOR_CHOICES,
  DEFAULT_ACCENT_COLOR,
  STATIC_THEME_TOKENS,
  accentColorTokens,
  contrastRatio,
  eventColorTokens,
  normalizeColorValue,
  resolveColor,
} from "../src/theme.js";

test("keeps runtime theme colors in one JavaScript source", () => {
  assert.equal(DEFAULT_ACCENT_COLOR, "#a8d2cc");
  assert.equal(ACCENT_COLOR_PRESETS.length, 4);
  assert.equal(STATIC_THEME_TOKENS.canvas, "#f2f4f3");
  assert.equal(STATIC_THEME_TOKENS.text, "#1f2925");
});

test("normalizes custom colors and falls back from unsafe values", () => {
  assert.equal(normalizeColorValue("#A1B2C3"), "#a1b2c3");
  assert.equal(normalizeColorValue("url(javascript:bad)", "#b96d4e"), "#b96d4e");
  assert.equal(resolveColor("sage"), "#b9d3b0");
});

test("keeps the built-in event palette light and pastel", () => {
  const colors = [...Object.values(COLOR_PRESETS), ...CUSTOM_COLOR_CHOICES.map(({ value }) => value)];
  assert.equal(CUSTOM_COLOR_CHOICES.length, 18);
  for (const color of colors) {
    assert.ok(contrastRatio(color, "#ffffff") <= 2.1, `${color} should stay light against white`);
    assert.ok(contrastRatio(color, "#ffffff") >= 1.25, `${color} should remain visible against white`);
  }
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
    assert.ok(contrastRatio(tokens.text, tokens.surface) >= 4.5);
    assert.match(tokens.surface, /^#[0-9a-f]{6}$/);
    assert.match(tokens.border, /^#[0-9a-f]{6}$/);
  }
});

test("softens every pastel surface while preserving its base marker and hue-aware text", () => {
  const expectedSurfaces = {
    apricot: "#f7d0c4",
    sage: "#d2e2cc",
    blue: "#c8dbef",
    lilac: "#dbd0ec",
    rose: "#eeced5",
    sand: "#ded5ca",
    teal: "#c0e3dd",
    plum: "#e1cfdd",
  };
  const textColors = new Set();
  for (const [name, color] of Object.entries(COLOR_PRESETS)) {
    const tokens = eventColorTokens(name);
    assert.equal(tokens.surface, expectedSurfaces[name]);
    assert.ok(contrastRatio(tokens.surface, "#ffffff") < contrastRatio(color, "#ffffff"));
    assert.equal(tokens.marker, color);
    assert.notEqual(tokens.text, STATIC_THEME_TOKENS.text);
    assert.ok(contrastRatio(tokens.text, tokens.surface) >= 4.5);
    textColors.add(tokens.text);
  }
  assert.equal(textColors.size, Object.keys(COLOR_PRESETS).length);
});
