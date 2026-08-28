import test from "node:test";
import assert from "node:assert/strict";

import {
  colorForEventContent,
  eventContentCategories,
  favoriteEventContents,
  updateEventContent,
  upsertEventContent,
} from "../src/content.js";

test("creates event content with an optional category and favorite flag", () => {
  const result = upsertEventContent([], {
    id: "content-walk",
    title: "  晚间   散步 ",
    category: " 健康 ",
    favorite: true,
    color: "sage",
  });

  assert.deepEqual(result, {
    content: {
      id: "content-walk",
      title: "晚间 散步",
      category: "健康",
      favorite: true,
      color: "sage",
    },
    contents: [{
      id: "content-walk",
      title: "晚间 散步",
      category: "健康",
      favorite: true,
      color: "sage",
    }],
    created: true,
  });
});

test("reuses duplicate content and can promote it to favorites", () => {
  const contents = [{ id: "read", title: "阅读", category: null, favorite: false, color: "blue" }];
  const result = upsertEventContent(contents, {
    id: "ignored",
    title: "阅读",
    category: "",
    favorite: true,
    color: "sage",
  });

  assert.equal(result.created, false);
  assert.equal(result.content.id, "read");
  assert.equal(result.content.favorite, true);
  assert.equal(result.content.color, "blue");
});

test("lists only favorites and inherits colors within a category", () => {
  const contents = [
    { id: "walk", title: "散步", category: "健康", favorite: true, color: "sage" },
    { id: "stretch", title: "拉伸", category: "健康", favorite: false, color: "sage" },
    { id: "read", title: "阅读", category: "兴趣", favorite: true, color: "blue" },
  ];

  assert.deepEqual(favoriteEventContents(contents).map((content) => content.id), ["walk", "read"]);
  assert.deepEqual(eventContentCategories(contents), ["健康", "兴趣"]);
  assert.equal(colorForEventContent(contents, "健康", ["apricot", "sage", "blue"]), "sage");
  assert.equal(colorForEventContent(contents, "家务", ["apricot", "sage", "blue"]), "apricot");
});

test("edits a reusable event content without changing its identity", () => {
  const contents = [
    { id: "walk", title: "散步", category: "健康", favorite: true, color: "sage" },
    { id: "tea", title: "泡茶", category: null, favorite: false, color: "apricot" },
  ];
  const result = updateEventContent(contents, "walk", {
    title: "  晚间   散步 ",
    category: " 放松 ",
    favorite: false,
    color: "blue",
  });

  assert.deepEqual(result.content, {
    id: "walk",
    title: "晚间 散步",
    category: "放松",
    favorite: false,
    color: "blue",
  });
  assert.equal(result.contents[0].id, "walk");
  assert.equal(result.contents[1], contents[1]);
});

test("rejects an event content edit that would create a duplicate", () => {
  const contents = [
    { id: "walk", title: "散步", category: "健康", favorite: true, color: "sage" },
    { id: "stretch", title: "拉伸", category: "健康", favorite: true, color: "blue" },
  ];

  assert.equal(updateEventContent(contents, "walk", {
    title: "拉伸",
    category: "健康",
    favorite: true,
    color: "sage",
  }), null);
});
