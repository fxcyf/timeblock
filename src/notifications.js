export function base64UrlToUint8Array(value) {
  const normalized = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(`${normalized}${padding}`);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function describePushEnvironment({ serviceWorker, pushManager, notification, ios = false, standalone = false }) {
  const supported = Boolean(serviceWorker && pushManager && notification);
  return { supported, requiresInstall: Boolean(ios) && !standalone };
}

export function browserPushEnvironment(windowObject = window, navigatorObject = navigator) {
  const userAgent = navigatorObject.userAgent || "";
  const ios = /iPad|iPhone|iPod/i.test(userAgent)
    || (navigatorObject.platform === "MacIntel" && navigatorObject.maxTouchPoints > 1);
  const standalone = navigatorObject.standalone === true
    || windowObject.matchMedia?.("(display-mode: standalone)").matches === true;
  return describePushEnvironment({
    serviceWorker: "serviceWorker" in navigatorObject,
    pushManager: "PushManager" in windowObject,
    notification: "Notification" in windowObject,
    ios,
    standalone,
  });
}

export function pushSubscriptionPayload(subscription) {
  const serialized = subscription?.toJSON?.() || {};
  const endpoint = serialized.endpoint || subscription?.endpoint;
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!/^https:\/\//i.test(endpoint || "") || !p256dh || !auth) throw new Error("浏览器返回的推送订阅信息无效");
  return { endpoint, keys: { p256dh, auth } };
}
