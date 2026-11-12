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
    // Load the SDK only inside the handler so module/runtime loading errors can
    // be returned as a safe JSON diagnostic instead of an opaque Netlify 502.
    const { signPrimusRequest } = await import("../../primus-signing.js");
    const signResult = await signPrimusRequest({
      signParams: body?.signParams,
      appId,
      appSecret
    });
    return json({ signResult });
  } catch (error) {
    const message = error?.message || "Primus could not sign the attestation request.";
    const errorCode = String(error?.code || "");
    const invalidSecret =
      /invalid private key|invalid hex|invalid arrayify|invalid argument.*key/i.test(message) ||
      errorCode === "PRIMUS_APP_SECRET_INVALID_FORMAT";
    const appIdMismatch = /App ID does not match/i.test(message);
    const isRequestError = /invalid|match|enabled|neutral recipient|expired|unsupported/i.test(message);
    const isModuleError = errorCode === "ERR_MODULE_NOT_FOUND" ||
      errorCode === "ERR_PACKAGE_PATH_NOT_EXPORTED" ||
      /cannot find package|cannot find module|module not found/i.test(message);
    const code = invalidSecret
      ? "PRIMUS_APP_SECRET_INVALID_FORMAT"
      : appIdMismatch
        ? "PRIMUS_APP_ID_MISMATCH"
        : isModuleError
          ? "PRIMUS_SDK_LOAD_ERROR"
          : isRequestError
            ? "PRIMUS_REQUEST_REJECTED"
            : "PRIMUS_SIGNING_RUNTIME_ERROR";
    const status = isRequestError ? 400 : 502;

    // Never log credentials, request parameters, private keys, or signatures.
    console.error("[primus-sign] failed", {
      code,
      errorName: error?.name || "Error",
      errorCode: errorCode || undefined
    });

    const publicMessage = invalidSecret
      ? "The App Secret could not be used as a signing key. Re-copy the App Secret from the same Primus project; do not include quotes or extra spaces."
      : appIdMismatch
        ? "The App ID in the request does not match the App ID configured for this Netlify site."
        : isModuleError
          ? "Netlify could not load the Primus SDK module. Check the function bundle and deployment logs."
          : isRequestError
            ? message
            : "The Primus SDK failed while signing the request. Open Netlify Logs & Metrics → Functions → primus-sign for the invocation details.";

    return json({ code, error: publicMessage }, status);
  }
}
