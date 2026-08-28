import test from "node:test";
import assert from "node:assert/strict";

import { hasMovedBeyondTolerance } from "../src/gesture.js";

test("keeps a steady press eligible for long-press selection", () => {
  assert.equal(hasMovedBeyondTolerance({ x: 100, y: 200 }, { x: 104, y: 205 }), false);
  assert.equal(hasMovedBeyondTolerance({ x: 100, y: 200 }, { x: 100, y: 208 }), false);
});

test("cancels long-press selection once the finger starts scrolling", () => {
  assert.equal(hasMovedBeyondTolerance({ x: 100, y: 200 }, { x: 100, y: 209 }), true);
  assert.equal(hasMovedBeyondTolerance({ x: 100, y: 200 }, { x: 110, y: 200 }), true);
});
