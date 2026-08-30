import test from "node:test";
import assert from "node:assert/strict";

import { colorTokens, contrastRatio, normalizeColorValue, resolveColor } from "../src/theme.js";

test("normalizes custom colors and falls back from unsafe values", () => {
  assert.equal(normalizeColorValue("#A1B2C3"), "#a1b2c3");
  assert.equal(normalizeColorValue("url(javascript:bad)", "#b96d4e"), "#b96d4e");
  assert.equal(resolveColor("sage"), "#cad9c5");
});

test("builds readable theme tokens for light and dark accents", () => {
  for (const accent of ["#285c4d", "#e7c7a1"]) {
    const tokens = colorTokens(accent);
    assert.ok(contrastRatio(tokens.accent, tokens.onAccent) >= 4.5);
    assert.match(tokens.soft, /^#[0-9a-f]{6}$/);
    assert.match(tokens.focus, /^#[0-9a-f]{6}$/);
  }
});
