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
