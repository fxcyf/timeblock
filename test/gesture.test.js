import test from "node:test";
import assert from "node:assert/strict";

import { blockPointerIntent, hasMovedBeyondTolerance } from "../src/gesture.js";

test("keeps a steady press eligible for long-press selection", () => {
  assert.equal(hasMovedBeyondTolerance({ x: 100, y: 200 }, { x: 104, y: 205 }), false);
  assert.equal(hasMovedBeyondTolerance({ x: 100, y: 200 }, { x: 100, y: 208 }), false);
});

test("cancels long-press selection once the finger starts scrolling", () => {
  assert.equal(hasMovedBeyondTolerance({ x: 100, y: 200 }, { x: 100, y: 209 }), true);
  assert.equal(hasMovedBeyondTolerance({ x: 100, y: 200 }, { x: 110, y: 200 }), true);
});

test("keeps block moving and resizing available in vertical timelines", () => {
  assert.equal(blockPointerIntent({ pointerType: "mouse", isResizeHandle: false, selectionMode: false, hourGrid: false }), "adjust");
  assert.equal(blockPointerIntent({ pointerType: "mouse", isResizeHandle: true, selectionMode: false, hourGrid: false }), "adjust");
  assert.equal(blockPointerIntent({ pointerType: "touch", isResizeHandle: true, selectionMode: false, hourGrid: false }), "adjust");
  assert.equal(blockPointerIntent({ pointerType: "touch", isResizeHandle: false, selectionMode: false, hourGrid: false }), "longPress");
  assert.equal(blockPointerIntent({ pointerType: "touch", isResizeHandle: false, selectionMode: true, hourGrid: false }), "group");
  assert.equal(blockPointerIntent({ pointerType: "mouse", isResizeHandle: false, selectionMode: false, hourGrid: true }), "none");
});
