const SESSION_STORAGE_KEY = "timeblock-supabase-session";

function apiError(payload, status) {
  const message = payload?.msg || payload?.message || payload?.error_description || payload?.error || `云端请求失败（${status}）`;
  return new Error(message);
}

export function resolveSyncAction({ hasRemote, hasLocalState, localChanged, remoteChanged }) {
  if (!hasRemote) return hasLocalState ? "upload" : "none";
  if (!hasLocalState) return "download";
  if (localChanged && remoteChanged) return "conflict";
  if (remoteChanged) return "download";
  if (localChanged) return "upload";
  return "none";
}

export function createSupabaseCloud({ projectUrl, publishableKey, fetchImpl = fetch, storage = localStorage, now = Date.now }) {
  const baseUrl = String(projectUrl || "").replace(/\/+$/, "");
  let session = null;

  function persistSession(next) {
    session = next;
    if (next) storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    else storage.removeItem(SESSION_STORAGE_KEY);
    return next;
  }

  function sessionFromPayload(payload) {
    if (!payload?.access_token || !payload?.refresh_token) return null;
    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: payload.expires_at || Math.floor(now() / 1000) + (payload.expires_in || 3600),
      user: payload.user,
    };
  }

  async function request(path, { method = "GET", body, accessToken, prefer } = {}) {
    const headers = { apikey: publishableKey };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (prefer) headers.Prefer = prefer;
    const response = await fetchImpl(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) throw apiError(payload, response.status);
    return payload;
  }

  async function refreshSession(refreshToken = session?.refresh_token) {
    if (!refreshToken) return persistSession(null);
    try {
      const payload = await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } });
      return persistSession(sessionFromPayload(payload));
    } catch (error) {
      persistSession(null);
      throw error;
    }
  }

  async function activeSession() {
    if (!session) return null;
    if ((session.expires_at || 0) <= Math.floor(now() / 1000) + 60) return refreshSession();
    return session;
  }

  return {
    getSession() { return session; },

    async completeAuthCallback(hash) {
      const parameters = new URLSearchParams(String(hash || "").replace(/^#/, ""));
      if (parameters.get("error_description")) throw new Error(parameters.get("error_description"));
      const accessToken = parameters.get("access_token");
      const refreshToken = parameters.get("refresh_token");
      if (!accessToken || !refreshToken) return null;
      const user = await request("/auth/v1/user", { accessToken });
      return persistSession({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Math.floor(now() / 1000) + Number(parameters.get("expires_in") || 3600),
        user,
      });
    },

    async restoreSession() {
      try { session = JSON.parse(storage.getItem(SESSION_STORAGE_KEY) || "null"); }
      catch { session = null; }
      if (!session?.access_token || !session?.refresh_token) return persistSession(null);
      return activeSession();
    },

    async signUp(email, password) {
      const payload = await request("/auth/v1/signup", { method: "POST", body: { email, password } });
      const next = sessionFromPayload(payload);
      if (next) persistSession(next);
      return { ...payload, session: next };
    },

    async signIn(email, password) {
      const payload = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
      return persistSession(sessionFromPayload(payload));
    },

    async signOut() {
      const current = await activeSession();
      try {
        if (current) await request("/auth/v1/logout", { method: "POST", accessToken: current.access_token });
      } finally {
        persistSession(null);
      }
    },

    async fetchState() {
      const current = await activeSession();
      if (!current) throw new Error("请先登录再同步");
      const query = new URLSearchParams({ select: "state,updated_at", limit: "1" });
      const rows = await request(`/rest/v1/timeblock_states?${query}`, { accessToken: current.access_token });
      return Array.isArray(rows) ? (rows[0] || null) : null;
    },

    async upsertState(state) {
      const current = await activeSession();
      if (!current?.user?.id) throw new Error("请先登录再同步");
      const rows = await request("/rest/v1/timeblock_states?on_conflict=user_id", {
        method: "POST",
        accessToken: current.access_token,
        prefer: "resolution=merge-duplicates,return=representation",
        body: { user_id: current.user.id, state },
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },
  };
}
