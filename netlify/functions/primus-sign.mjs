import { signPrimusRequest } from "../../primus-signing.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;
  if (!appId || !appSecret) {
    return json({
      error: "Primus is not configured for this Netlify site. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET under Site configuration → Environment variables, then redeploy."
    }, 503);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 24_576) {
      return json({ error: "Signing request is too large." }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON request." }, 400);
  }

  try {
    const signResult = await signPrimusRequest({
      signParams: body?.signParams,
      appId,
      appSecret
    });
    return json({ signResult });
  } catch (error) {
    const message = error?.message || "Primus could not sign the attestation request.";
    const status = /invalid|match|enabled|neutral recipient|expired|unsupported/i.test(message) ? 400 : 502;
    // Do not log secrets, sign parameters, or signed payloads.
    console.error("[primus-sign] request signing failed");
    return json({ error: message }, status);
  }
}
