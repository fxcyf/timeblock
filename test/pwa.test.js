import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", root), "utf8"));

function pngSize(path) {
  const bytes = readFileSync(new URL(path, root));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test("declares branded browser, Apple, and installable-app icons", () => {
  assert.match(html, /<link rel="icon" href="icons\/favicon\.svg" type="image\/svg\+xml" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png" \/>/);
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest" \/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Timeblock" \/>/);

  assert.equal(manifest.name, "Timeblock");
  assert.equal(manifest.short_name, "Timeblock");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons.map(({ sizes, purpose }) => [sizes, purpose]), [
    ["192x192", "any"],
    ["512x512", "any"],
    ["512x512", "maskable"],
  ]);

  assert.deepEqual(pngSize("icons/apple-touch-icon.png"), [180, 180]);
  assert.deepEqual(pngSize("icons/icon-192.png"), [192, 192]);
  assert.deepEqual(pngSize("icons/icon-512.png"), [512, 512]);
  assert.deepEqual(pngSize("icons/icon-maskable-512.png"), [512, 512]);
  assert.match(readFileSync(new URL("icons/favicon.svg", root), "utf8"), /aria-label="Timeblock"/);
});

test("serves Web App Manifests with their standard content type", () => {
  const server = readFileSync(new URL("scripts/serve.mjs", root), "utf8");
  assert.match(server, /"\.webmanifest": "application\/manifest\+json; charset=utf-8"/);
});
