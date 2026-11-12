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
      code: "PRIMUS_CREDENTIALS_MISSING",
      error: "Netlify Functions cannot see both ZKTLS_APP_ID and ZKTLS_APP_SECRET. Check that both are enabled for Production and the Functions scope, then redeploy."
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
    const isRequestError = /invalid|match|enabled|neutral recipient|expired|unsupported/i.test(message);
    const invalidSecret = /invalid private key|invalid hex|invalid arrayify|invalid argument.*key/i.test(message);
    const code = invalidSecret
      ? "PRIMUS_APP_SECRET_INVALID_FORMAT"
      : /App ID does not match/i.test(message)
        ? "PRIMUS_APP_ID_MISMATCH"
        : isRequestError
          ? "PRIMUS_REQUEST_REJECTED"
          : "PRIMUS_SIGNING_RUNTIME_ERROR";
    const status = isRequestError ? 400 : 502;
    // Log only classified diagnostics; never log credentials, signParams, or signed payloads.
    console.error("[primus-sign] failed", { code, errorName: error?.name || "Error" });
    const publicMessage = invalidSecret
      ? "The App Secret could not be used as a signing key. Re-copy the App Secret from the same Primus project; do not include quotes or extra spaces."
      : message;
    return json({ code, error: publicMessage }, status);
  }
}
