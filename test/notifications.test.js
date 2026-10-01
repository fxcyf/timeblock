import test from "node:test";
import assert from "node:assert/strict";

import {
  base64UrlToUint8Array,
  describePushEnvironment,
  pushSubscriptionPayload,
} from "../src/notifications.js";

test("decodes URL-safe VAPID public keys", () => {
  assert.deepEqual([...base64UrlToUint8Array("AQID-vs")], [1, 2, 3, 250, 251]);
});

test("distinguishes unsupported browsers and iOS home-screen mode", () => {
  assert.deepEqual(describePushEnvironment({ serviceWorker: false, pushManager: false, notification: false }), {
    supported: false,
    requiresInstall: false,
  });
  assert.deepEqual(describePushEnvironment({ serviceWorker: true, pushManager: true, notification: true, ios: true, standalone: false }), {
    supported: true,
    requiresInstall: true,
  });
  assert.deepEqual(describePushEnvironment({ serviceWorker: true, pushManager: false, notification: false, ios: true, standalone: false }), {
    supported: false,
    requiresInstall: true,
  });
  assert.deepEqual(describePushEnvironment({ serviceWorker: true, pushManager: true, notification: true, ios: true, standalone: true }), {
    supported: true,
    requiresInstall: false,
  });
});

test("normalizes a browser push subscription for the server", () => {
  const payload = pushSubscriptionPayload({
    endpoint: "https://push.example.test/device",
    toJSON: () => ({ endpoint: "https://push.example.test/device", keys: { p256dh: "public-key", auth: "auth-key" } }),
  });
  assert.deepEqual(payload, {
    endpoint: "https://push.example.test/device",
    keys: { p256dh: "public-key", auth: "auth-key" },
  });
  assert.throws(() => pushSubscriptionPayload({ endpoint: "invalid", toJSON: () => ({ keys: {} }) }), /订阅信息无效/);
});
