const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const projectUrl = Deno.env.get("SUPABASE_URL") || "";
  const apiKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const response = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: { apikey: apiKey, Authorization: authorization },
  });
  return response.ok ? response.json() : null;
}

async function adminRequest(path: string, { method = "GET", body, prefer }: { method?: string; body?: unknown; prefer?: string } = {}) {
  const projectUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const headers: Record<string, string> = { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  return fetch(`${projectUrl}/rest/v1/${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function validTimezone(timezone: unknown) {
  if (typeof timezone !== "string" || timezone.length > 80) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); return true; }
  catch { return false; }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const user = await authenticatedUser(request);
    if (!user?.id) return json({ error: "请先登录再设置通知" }, 401);

    if (request.method === "GET") {
      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
      if (!vapidPublicKey) return json({ error: "推送服务尚未配置" }, 503);
      return json({ vapidPublicKey });
    }

    const payload = await request.json().catch(() => ({}));
    const endpoint = payload?.subscription?.endpoint;
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 4096) {
      return json({ error: "推送订阅地址无效" }, 400);
    }

    if (request.method === "DELETE") {
      const query = new URLSearchParams({ user_id: `eq.${user.id}`, endpoint: `eq.${endpoint}` });
      const response = await adminRequest(`push_subscriptions?${query}`, { method: "DELETE" });
      if (!response.ok) return json({ error: "无法关闭此设备的通知" }, 502);
      return json({ disabled: true });
    }

    if (request.method !== "POST") return json({ error: "不支持的请求方法" }, 405);
    const p256dh = payload?.subscription?.keys?.p256dh;
    const auth = payload?.subscription?.keys?.auth;
    const notifyStart = payload?.notifyStart !== false;
    const notifyEnd = payload?.notifyEnd !== false;
    if (typeof p256dh !== "string" || !p256dh || typeof auth !== "string" || !auth) {
      return json({ error: "推送订阅密钥无效" }, 400);
    }
    if (!notifyStart && !notifyEnd) return json({ error: "请至少保留一种提醒" }, 400);
    if (!validTimezone(payload?.timezone)) return json({ error: "设备时区无效" }, 400);

    const response = await adminRequest("push_subscriptions?on_conflict=endpoint", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        timezone: payload.timezone,
        notify_start: notifyStart,
        notify_end: notifyEnd,
        user_agent: String(payload?.userAgent || "").slice(0, 500) || null,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("push subscription upsert failed", response.status, detail);
      return json({ error: "无法保存此设备的通知设置" }, 502);
    }
    return json({ enabled: true });
  } catch (error) {
    console.error("push subscription function failed", error);
    return json({ error: "通知服务暂时不可用" }, 500);
  }
});
