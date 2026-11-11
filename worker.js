import { createBinanceBalanceProof } from "./binance.js";

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});

function corsHeaders(request, env, requestUrl) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const configured = (env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
  const allowed = new Set([requestUrl.origin, ...configured]);
  return allowed.has(origin) ? { "access-control-allow-origin": origin, "vary": "Origin" } : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env, url);
    if (cors === null) return json({ error: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type", "access-control-max-age": "86400" } });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, app: "proof-of-balance", primusConfigured: Boolean(env.ZKTLS_APP_ID && env.ZKTLS_APP_SECRET) }, 200, cors);
    }
    if (url.pathname === "/api/verify/binance" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const bucket = env.RATE_LIMIT;
      if (bucket) {
        const key = new URL("/" + encodeURIComponent(ip), "https://rate-limit.internal");
        const now = Date.now();
        const prior = await bucket.get(key.pathname, "json");
        if (prior && prior.until > now && prior.count >= 8) return json({ error: "Too many attempts. Please wait one minute and try again." }, 429, cors);
        const state = prior && prior.until > now ? { count: prior.count + 1, until: prior.until } : { count: 1, until: now + 60_000 };
        await bucket.put(key.pathname, JSON.stringify(state), { expirationTtl: 65 });
      }
      if (!env.ZKTLS_APP_ID || !env.ZKTLS_APP_SECRET) return json({ error: "Primus is not configured. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET as Worker secrets." }, 503, cors);
      let body;
      try {
        const length = Number(request.headers.get("content-length") || 0);
        if (length > 32_768) return json({ error: "Request is too large." }, 413, cors);
        body = await request.json();
      } catch { return json({ error: "Invalid JSON request." }, 400, cors); }
      const { apiKey, apiSecret, asset, minimum } = body || {};
      if (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 256 || typeof apiSecret !== "string" || apiSecret.length < 8 || apiSecret.length > 256) return json({ error: "Enter a valid Binance read-only API key and secret." }, 400, cors);
      const cleanAsset = String(asset || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{2,20}$/.test(cleanAsset)) return json({ error: "Enter a valid asset symbol, such as USDT or BTC." }, 400, cors);
      const cleanMinimum = String(minimum ?? "").trim();
      if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(cleanMinimum) || Number(cleanMinimum) <= 0) return json({ error: "Minimum balance must be a positive decimal amount (up to 18 decimal places)." }, 400, cors);
      try {
        const result = await createBinanceBalanceProof({ apiKey, apiSecret, asset: cleanAsset, minimum: cleanMinimum, appId: env.ZKTLS_APP_ID, appSecret: env.ZKTLS_APP_SECRET });
        return json({ requestId: crypto.randomUUID(), ...result }, 200, cors);
      } catch (error) {
        const message = error?.publicMessage || "Verification failed. Check your API key permissions, Primus setup and try again.";
        return json({ requestId: crypto.randomUUID(), error: message }, 502, cors);
      }
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404, cors);
    return env.ASSETS.fetch(request);
  },
};
