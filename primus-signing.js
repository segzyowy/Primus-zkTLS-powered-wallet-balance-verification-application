import { PrimusZKTLS } from "@primuslabs/zktls-js-sdk";

export const PRIMUS_NEUTRAL_RECIPIENT = "0x0000000000000000000000000000000000000000";

export const ALLOWED_PRIMUS_TEMPLATES = new Set([
  "67ed246d-ff00-47d5-9026-5ff09cbdd65b",
  "c25c9f6a-b816-4a67-86ab-7292eff209a3"
]);

export function validatePrimusSignParams(signParams, expectedAppId) {
  if (typeof signParams !== "string" || signParams.length < 2 || signParams.length > 24_000) {
    throw new Error("Invalid Primus signing request.");
  }

  let request;
  try {
    request = JSON.parse(signParams);
  } catch {
    throw new Error("Primus signing request is not valid JSON.");
  }

  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Invalid Primus signing request.");
  }
  if (request.appId !== expectedAppId) {
    throw new Error("The Primus App ID does not match this application.");
  }
  if (!ALLOWED_PRIMUS_TEMPLATES.has(request.attTemplateID)) {
    throw new Error("This Primus template is not enabled in this application.");
  }
  if (request.userAddress !== PRIMUS_NEUTRAL_RECIPIENT) {
    throw new Error("This application only signs requests using its neutral recipient identifier.");
  }
  if (!Number.isFinite(request.timestamp) || Math.abs(Date.now() - request.timestamp) > 5 * 60_000) {
    throw new Error("The Primus request has expired. Please try again.");
  }
  if (!request.attMode || request.attMode.algorithmType !== "proxytls") {
    throw new Error("Unsupported Primus attestation mode.");
  }

  return request;
}

export async function signPrimusRequest({ signParams, appId, appSecret }) {
  if (typeof appId !== "string" || !appId || typeof appSecret !== "string" || !appSecret) {
    throw new Error("Primus is not configured. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET as encrypted secrets.");
  }
  validatePrimusSignParams(signParams, appId);

  const primus = new PrimusZKTLS();
  await primus.init(appId, appSecret);
  return primus.sign(signParams);
}
