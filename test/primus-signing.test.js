import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_PRIMUS_TEMPLATES, PRIMUS_NEUTRAL_RECIPIENT, validatePrimusSignParams } from "../primus-signing.js";

function request(overrides = {}) {
  return JSON.stringify({
    appId: "public-primus-app-id",
    attTemplateID: "67ed246d-ff00-47d5-9026-5ff09cbdd65b",
    userAddress: PRIMUS_NEUTRAL_RECIPIENT,
    timestamp: Date.now(),
    attMode: { algorithmType: "proxytls", resultType: "plain" },
    ...overrides
  });
}

test("only the two configured Binance templates can be signed", () => {
  assert.equal(ALLOWED_PRIMUS_TEMPLATES.size, 2);
  assert.equal(validatePrimusSignParams(request(), "public-primus-app-id").attTemplateID, "67ed246d-ff00-47d5-9026-5ff09cbdd65b");
  assert.throws(() => validatePrimusSignParams(request({ attTemplateID: "another-template" }), "public-primus-app-id"), /not enabled/);
});

test("signing is restricted to the neutral no-wallet recipient", () => {
  assert.equal(validatePrimusSignParams(request(), "public-primus-app-id").userAddress, PRIMUS_NEUTRAL_RECIPIENT);
  assert.throws(() => validatePrimusSignParams(request({ userAddress: "0x0000000000000000000000000000000000000001" }), "public-primus-app-id"), /neutral recipient/);
});

test("request must use this application's App ID and supported TLS mode", () => {
  assert.throws(() => validatePrimusSignParams(request(), "different-app-id"), /does not match/);
  assert.throws(() => validatePrimusSignParams(request({ attMode: { algorithmType: "unknown" } }), "public-primus-app-id"), /Unsupported/);
});

test("signing rejects malformed and expired requests", () => {
  assert.throws(() => validatePrimusSignParams("{bad}", "public-primus-app-id"), /valid JSON/);
  assert.throws(() => validatePrimusSignParams(request({ timestamp: Date.now() - 10 * 60_000 }), "public-primus-app-id"), /expired/);
});
