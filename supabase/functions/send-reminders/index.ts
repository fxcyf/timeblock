import webpush from "npm:web-push@3.6.7";
import { localClocksInLookback, remindersForLocalMinute } from "../_shared/reminders.js";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

const projectUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function rest(path: string, { method = "GET", body, prefer }: { method?: string; body?: unknown; prefer?: string } = {}) {
  const headers: Record<string, string> = { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${projectUrl}/rest/v1/${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`database request failed (${response.status}): ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function claimDelivery(subscription: any, eventKey: string) {
  const rows = await rest("push_deliveries?on_conflict=subscription_id,event_key", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=representation",
    body: { user_id: subscription.user_id, subscription_id: subscription.id, event_key: eventKey },
  });
  return Array.isArray(rows) && rows.length > 0;
}

async function releaseDelivery(subscriptionId: number, eventKey: string) {
  const query = new URLSearchParams({ subscription_id: `eq.${subscriptionId}`, event_key: `eq.${eventKey}` });
  await rest(`push_deliveries?${query}`, { method: "DELETE" });
}

async function removeSubscription(subscriptionId: number) {
  await rest(`push_subscriptions?id=eq.${subscriptionId}`, { method: "DELETE" });
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET") || "";
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return json({ error: "unauthorized" }, 401);

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "";
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject || !projectUrl || !serviceRole) {
    return json({ error: "push service is not configured" }, 503);
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  try {
    const [stateRows, subscriptions] = await Promise.all([
      rest("timeblock_states?select=user_id,state"),
      rest("push_subscriptions?select=id,user_id,endpoint,p256dh,auth,timezone,notify_start,notify_end"),
    ]);
    const states = new Map((stateRows || []).map((row: any) => [row.user_id, row.state]));
    const now = new Date();
    let sent = 0;
    let removed = 0;
    let failed = 0;

    subscriptionsLoop: for (const subscription of subscriptions || []) {
      const state = states.get(subscription.user_id);
      if (!state) continue;
      let clocks;
      try { clocks = localClocksInLookback(now, subscription.timezone, 3); }
      catch {
        console.error("invalid subscription timezone", subscription.id, subscription.timezone);
        continue;
      }
      for (const clock of clocks) {
        const reminders = remindersForLocalMinute(state, clock.dateKey, clock.minute, {
          notifyStart: subscription.notify_start,
          notifyEnd: subscription.notify_end,
        });
        for (const reminder of reminders) {
          if (!await claimDelivery(subscription, reminder.eventKey)) continue;
          const payload = JSON.stringify({
            title: reminder.title,
            body: `${reminder.kind === "start" ? "开始" : "结束"} · ${reminder.timeRange}${reminder.category ? ` · ${reminder.category}` : ""}`,
            tag: reminder.eventKey,
          });
          try {
            await webpush.sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            }, payload, { TTL: 300, urgency: "high" });
            sent += 1;
          } catch (error) {
            const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
            if (statusCode === 404 || statusCode === 410) {
              await removeSubscription(subscription.id);
              removed += 1;
              continue subscriptionsLoop;
            }
            await releaseDelivery(subscription.id, reminder.eventKey);
            failed += 1;
            console.error("push delivery failed", subscription.id, statusCode || error);
          }
        }
      }
    }

    const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    await rest(`push_deliveries?sent_at=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE" });
    return json({ sent, removed, failed });
  } catch (error) {
    console.error("reminder dispatch failed", error);
    return json({ error: "reminder dispatch failed" }, 500);
  }
});
