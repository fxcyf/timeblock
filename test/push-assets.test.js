import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const subscriptionFunction = readFileSync(new URL("../supabase/functions/push-subscriptions/index.ts", import.meta.url), "utf8");
const reminderFunction = readFileSync(new URL("../supabase/functions/send-reminders/index.ts", import.meta.url), "utf8");

test("ships an installable web app and push notification controls", () => {
  assert.match(html, /rel="manifest" href="manifest\.webmanifest(?:\?v=\d+)?"/);
  assert.match(html, /id="notificationEnableButton"/);
  assert.match(html, /id="notificationStartSetting"/);
  assert.match(html, /id="notificationEndSetting"/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /addEventListener\("notificationclick"/);
});

test("isolates subscriptions with RLS and deduplicates deliveries", () => {
  assert.match(schema, /create table if not exists public\.push_subscriptions/i);
  assert.match(schema, /unique\s*\(endpoint\)/i);
  assert.match(schema, /push_subscriptions enable row level security/i);
  assert.match(schema, /create table if not exists public\.push_deliveries/i);
  assert.match(schema, /unique\s*\(subscription_id, event_key\)/i);
  assert.match(schema, /revoke all on table public\.push_deliveries from anon, authenticated/i);
});

test("keeps VAPID private material in server functions", () => {
  assert.match(subscriptionFunction, /Deno\.env\.get\("VAPID_PUBLIC_KEY"\)/);
  assert.match(reminderFunction, /Deno\.env\.get\("VAPID_PRIVATE_KEY"\)/);
  assert.match(reminderFunction, /REMINDER_CRON_SECRET/);
  assert.match(reminderFunction, /push_deliveries/);
  assert.doesNotMatch(html, /VAPID_PRIVATE_KEY|service_role/i);
});
