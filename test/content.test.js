import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveEventContent,
  archivedEventContents,
  colorForEventContent,
  eventContentCategories,
  favoriteEventContents,
  moveEventContent,
  removeEventContent,
  restoreEventContent,
  updateEventContent,
  upsertEventContent,
} from "../src/content.js";

test("creates event content with an optional category and favorite state", () => {
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
      status: "favorite",
      color: "sage",
      sortOrder: 0,
    },
    contents: [{
      id: "content-walk",
      title: "晚间 散步",
      category: "健康",
      status: "favorite",
      color: "sage",
      sortOrder: 0,
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
  assert.equal(result.content.status, "favorite");
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
    status: "archived",
    color: "blue",
  });

  assert.deepEqual(result.content, {
    id: "walk",
    title: "晚间 散步",
    category: "放松",
    status: "archived",
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

test("deletes and reorders reusable event content without touching block snapshots", () => {
  const contents = [
    { id: "walk", title: "散步", favorite: true, sortOrder: 0 },
    { id: "read", title: "阅读", favorite: true, sortOrder: 1 },
    { id: "tea", title: "泡茶", favorite: false, sortOrder: 2 },
  ];

  assert.deepEqual(removeEventContent(contents, "read").map((item) => item.id), ["walk", "tea"]);
  assert.deepEqual(moveEventContent(contents, "read", -1).map((item) => item.id), ["read", "walk", "tea"]);
  assert.deepEqual(moveEventContent(contents, "walk", -1).map((item) => item.id), ["walk", "read", "tea"]);
});

test("reorders favorites across hidden one-off content", () => {
  const contents = [
    { id: "walk", title: "散步", favorite: true, sortOrder: 0 },
    { id: "tea", title: "泡茶", favorite: false, sortOrder: 1 },
    { id: "read", title: "阅读", favorite: true, sortOrder: 2 },
  ];
  const moved = moveEventContent(contents, "read", -1);
  assert.deepEqual(favoriteEventContents(moved).map((item) => item.id), ["read", "walk"]);
});

test("archives and restores favorites while one-time content stays hidden", () => {
  const contents = [
    { id: "walk", title: "散步", status: "favorite", sortOrder: 0 },
    { id: "tea", title: "泡茶", status: "oneTime", sortOrder: 1 },
  ];
  const archived = archiveEventContent(contents, "walk");
  assert.deepEqual(favoriteEventContents(archived), []);
  assert.deepEqual(archivedEventContents(archived).map((item) => item.id), ["walk"]);
  assert.equal(archivedEventContents(archived).some((item) => item.id === "tea"), false);
  assert.deepEqual(favoriteEventContents(restoreEventContent(archived, "walk")).map((item) => item.id), ["walk"]);
});
