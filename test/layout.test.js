import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("keeps mobile chrome inside iPadOS safe areas", () => {
  assert.match(html, /width=device-width, initial-scale=1\.0, viewport-fit=cover/);
  assert.match(css, /body \{ padding-top: env\(safe-area-inset-top, 0px\);/);
  assert.match(css, /\.topbar \{ top: calc\(8px \+ env\(safe-area-inset-top, 0px\)\);/);
  assert.match(css, /\.mobile-nav \{[^}]*right: max\(8px, env\(safe-area-inset-right, 0px\)\);[^}]*bottom: calc\(8px \+ env\(safe-area-inset-bottom, 0px\)\);[^}]*left: max\(8px, env\(safe-area-inset-left, 0px\)\);/);
  assert.match(css, /\.mobile-nav \{[^}]*border: 1px solid var\(--line\);[^}]*border-radius: 16px;/);
});

test("keeps mobile overlays away from the bottom navigation", () => {
  assert.match(css, /\.action-picker \{[^}]*top: 44%;[^}]*bottom: auto;[^}]*left: 50% !important;[^}]*transform: translate\(-50%, -50%\);/);
  assert.match(css, /\.sheet-dialog \{[^}]*margin: auto;[^}]*border-radius: 18px;/);
  assert.match(css, /\.toast \{[^}]*top: calc\(84px \+ env\(safe-area-inset-top, 0px\)\);[^}]*bottom: auto;/);
  assert.match(css, /\.selection-toolbar \{[^}]*top: calc\(84px \+ env\(safe-area-inset-top, 0px\)\);[^}]*bottom: auto;/);
  assert.doesNotMatch(css, /\.sheet-dialog \{[^}]*margin: auto 0 0/);
});
