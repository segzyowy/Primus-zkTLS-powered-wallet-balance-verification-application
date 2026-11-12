import { signPrimusRequest } from "./primus-signing.js";

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});

function corsHeaders(request, env, requestUrl) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const configured = (env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  const allowed = new Set([requestUrl.origin, ...configured]);
  return allowed.has(origin) ? { "access-control-allow-origin": origin, "vary": "Origin" } : null;
}

async function enforceSigningRateLimit(request, env) {
  const bucket = env.RATE_LIMIT;
  if (!bucket) return null;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = "/primus-sign/" + encodeURIComponent(ip);
  const now = Date.now();
  const previous = await bucket.get(key, "json");
  if (previous && previous.until > now && previous.count >= 10) {
    return json({ error: "Too many attestation attempts. Please wait one minute and try again." }, 429);
  }
  const state = previous && previous.until > now
    ? { count: previous.count + 1, until: previous.until }
    : { count: 1, until: now + 60_000 };
  await bucket.put(key, JSON.stringify(state), { expirationTtl: 65 });
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env, url);
    if (cors === null) return json({ error: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type",
          "access-control-max-age": "86400"
        }
      });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        app: "proof-of-balance",
        primusConfigured: Boolean(env.ZKTLS_APP_ID && env.ZKTLS_APP_SECRET),
        walletIntegration: false
      }, 200, cors);
    }

    if (url.pathname === "/api/primus/config" && request.method === "GET") {
      if (!env.ZKTLS_APP_ID || !env.ZKTLS_APP_SECRET) {
        return json({ error: "Primus is not configured. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET as encrypted Worker secrets." }, 503, cors);
      }
      // The App ID is public; the App Secret is never returned to the browser.
      return json({ appId: env.ZKTLS_APP_ID }, 200, cors);
    }

    if (url.pathname === "/api/primus/sign" && request.method === "POST") {
      if (!env.ZKTLS_APP_ID || !env.ZKTLS_APP_SECRET) {
        return json({ error: "Primus is not configured. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET as encrypted Worker secrets." }, 503, cors);
      }

      const limited = await enforceSigningRateLimit(request, env);
      if (limited) return new Response(limited.body, { status: limited.status, headers: { ...Object.fromEntries(limited.headers), ...cors } });

      let body;
      try {
        const length = Number(request.headers.get("content-length") || 0);
        if (length > 24_576) return json({ error: "Signing request is too large." }, 413, cors);
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON request." }, 400, cors);
      }

      try {
        const signResult = await signPrimusRequest({
          signParams: body?.signParams,
          appId: env.ZKTLS_APP_ID,
          appSecret: env.ZKTLS_APP_SECRET
        });
        return json({ signResult }, 200, cors);
      } catch (error) {
        const message = error?.message || "Primus could not sign the attestation request.";
        const status = /invalid|match|enabled|neutral recipient|expired|unsupported/i.test(message) ? 400 : 502;
        return json({ error: message }, status, cors);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404, cors);
    return env.ASSETS.fetch(request);
  },
};
