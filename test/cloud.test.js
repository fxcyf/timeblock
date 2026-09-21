import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSupabaseCloud, resolveSyncAction } from "../src/cloud.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const config = readFileSync(new URL("../src/cloud-config.js", import.meta.url), "utf8");

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("chooses safe sync actions and detects divergent changes", () => {
  assert.equal(resolveSyncAction({ hasRemote: false, hasLocalState: true, localChanged: true, remoteChanged: false }), "upload");
  assert.equal(resolveSyncAction({ hasRemote: true, hasLocalState: false, localChanged: false, remoteChanged: true }), "download");
  assert.equal(resolveSyncAction({ hasRemote: true, hasLocalState: true, localChanged: true, remoteChanged: true }), "conflict");
  assert.equal(resolveSyncAction({ hasRemote: true, hasLocalState: true, localChanged: false, remoteChanged: false }), "none");
});

test("authenticates with the publishable key and persists a refreshable session", async () => {
  const calls = [];
  const stored = new Map();
  const cloud = createSupabaseCloud({
    projectUrl: "https://example.supabase.co/",
    publishableKey: "sb_publishable_test",
    storage: { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ access_token: "access", refresh_token: "refresh", expires_in: 3600, user: { id: "user-1", email: "me@example.com" } });
    },
    now: () => 1_000_000,
  });

  const session = await cloud.signIn("me@example.com", "password123");
  assert.equal(session.user.id, "user-1");
  assert.match(calls[0].url, /auth\/v1\/token\?grant_type=password$/);
  assert.equal(calls[0].options.headers.apikey, "sb_publishable_test");
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: "me@example.com", password: "password123" });
  assert.equal(JSON.parse(stored.get("timeblock-supabase-session")).refresh_token, "refresh");
});

test("sends signup confirmation back to the deployed app path", async () => {
  let requestedUrl = "";
  const cloud = createSupabaseCloud({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetchImpl: async (url) => {
      requestedUrl = url;
      return response({ user: { id: "user-1", email: "me@example.com" } });
    },
  });

  await cloud.signUp("me@example.com", "password123", "https://fxcyf.github.io/timeblock/");
  assert.equal(requestedUrl, "https://example.supabase.co/auth/v1/signup?redirect_to=https%3A%2F%2Ffxcyf.github.io%2Ftimeblock%2F");
});

test("reads and upserts only the authenticated user's cloud state", async () => {
  const calls = [];
  const stored = new Map([["timeblock-supabase-session", JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_at: 9_999_999, user: { id: "user-1", email: "me@example.com" } })]]);
  const cloud = createSupabaseCloud({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    storage: { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.method === "GET") return response([{ state: { schemaVersion: 2 }, updated_at: "2026-09-21T10:00:00.000Z" }]);
      return response([{ state: { schemaVersion: 2 }, updated_at: "2026-09-21T10:01:00.000Z" }]);
    },
    now: () => 1_000_000,
  });

  await cloud.restoreSession();
  assert.equal((await cloud.fetchState()).updated_at, "2026-09-21T10:00:00.000Z");
  assert.equal((await cloud.upsertState({ schemaVersion: 2 })).updated_at, "2026-09-21T10:01:00.000Z");
  assert.match(calls[0].url, /rest\/v1\/timeblock_states\?select=state%2Cupdated_at&limit=1$/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer access");
  assert.deepEqual(JSON.parse(calls[1].options.body), { user_id: "user-1", state: { schemaVersion: 2 } });
  assert.match(calls[1].options.headers.Prefer, /resolution=merge-duplicates/);
});

test("surfaces Supabase API errors without leaking credentials", async () => {
  const cloud = createSupabaseCloud({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetchImpl: async () => response({ msg: "Invalid login credentials" }, 400),
  });
  await assert.rejects(() => cloud.signIn("me@example.com", "wrong-password"), /Invalid login credentials/);
});

test("completes an email-confirmation callback and removes tokens from app concerns", async () => {
  const stored = new Map();
  const cloud = createSupabaseCloud({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    storage: { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
    fetchImpl: async (url, options) => {
      assert.match(url, /auth\/v1\/user$/);
      assert.equal(options.headers.Authorization, "Bearer callback-access");
      return response({ id: "user-1", email: "me@example.com" });
    },
    now: () => 1_000_000,
  });
  const session = await cloud.completeAuthCallback("#access_token=callback-access&refresh_token=callback-refresh&expires_in=3600");
  assert.equal(session.user.email, "me@example.com");
  assert.equal(JSON.parse(stored.get("timeblock-supabase-session")).refresh_token, "callback-refresh");
});

test("ships login controls and an RLS-isolated schema without secret keys", () => {
  for (const id of ["cloudAuthForm", "cloudEmail", "cloudPassword", "cloudSyncButton", "scheduleSyncButton", "cloudUseRemoteButton", "cloudUseLocalButton"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="scheduleSyncButton"[^>]*aria-label="立即同步云端数据"[^>]*hidden/);
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /auth\.uid\(\)\) = user_id/g);
  assert.match(schema, /revoke all .* from anon/i);
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /sb_secret_|service_role\s*=/i);
});
