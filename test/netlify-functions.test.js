import test from "node:test";
import assert from "node:assert/strict";
import health from "../netlify/functions/health.mjs";
import config from "../netlify/functions/primus-config.mjs";
import sign from "../netlify/functions/primus-sign.mjs";

const ORIGINAL_APP_ID = process.env.ZKTLS_APP_ID;
const ORIGINAL_APP_SECRET = process.env.ZKTLS_APP_SECRET;

function clearCredentials() {
  delete process.env.ZKTLS_APP_ID;
  delete process.env.ZKTLS_APP_SECRET;
}

function restoreCredentials() {
  if (ORIGINAL_APP_ID === undefined) delete process.env.ZKTLS_APP_ID;
  else process.env.ZKTLS_APP_ID = ORIGINAL_APP_ID;
  if (ORIGINAL_APP_SECRET === undefined) delete process.env.ZKTLS_APP_SECRET;
  else process.env.ZKTLS_APP_SECRET = ORIGINAL_APP_SECRET;
}

test("Netlify functions expose health but never expose secrets", async () => {
  clearCredentials();
  try {
    const healthResponse = await health(new Request("https://veriffy.netlify.app/api/health"));
    const healthData = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(healthData.ok, true);
    assert.equal(healthData.app, "veriffy");
    assert.equal(healthData.primusConfigured, false);
    assert.equal(healthData.walletIntegration, false);
    assert.equal(Object.hasOwn(healthData, "appSecret"), false);

    const configResponse = await config(new Request("https://veriffy.netlify.app/api/primus/config"));
    const configData = await configResponse.json();
    assert.equal(configResponse.status, 503);
    assert.match(configData.error, /Netlify site/);
    assert.equal(Object.hasOwn(configData, "appSecret"), false);

    const signResponse = await sign(new Request("https://veriffy.netlify.app/api/primus/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signParams: "{}" })
    }));
    const signData = await signResponse.json();
    assert.equal(signResponse.status, 503);
    assert.equal(signData.code, "PRIMUS_CREDENTIALS_MISSING");
    assert.match(signData.error, /Functions cannot see both/);
    assert.equal(Object.hasOwn(signData, "appSecret"), false);
  } finally {
    restoreCredentials();
  }
});

test("Netlify signing function rejects unsupported methods safely", async () => {
  const response = await sign(new Request("https://veriffy.netlify.app/api/primus/sign", {
    method: "GET"
  }));
  const data = await response.json();
  assert.equal(response.status, 405);
  assert.match(data.error, /Method not allowed/);
});

test("Netlify signing function identifies an invalid-format App Secret without exposing it", async () => {
  process.env.ZKTLS_APP_ID = "primus-test-app-id";
  process.env.ZKTLS_APP_SECRET = "not-a-valid-signing-key";
  const signParams = JSON.stringify({
    appId: "primus-test-app-id",
    attTemplateID: "c25c9f6a-b816-4a67-86ab-7292eff209a3",
    userAddress: "0x0000000000000000000000000000000000000000",
    timestamp: Date.now(),
    attMode: { algorithmType: "proxytls" }
  });
  try {
    const response = await sign(new Request("https://veriffy.netlify.app/api/primus/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signParams })
    }));
    const data = await response.json();
    assert.equal(response.status, 400);
    assert.equal(data.code, "PRIMUS_APP_SECRET_INVALID_FORMAT");
    assert.match(data.error, /App Secret could not be used as a signing key/);
    assert.equal(JSON.stringify(data).includes("not-a-valid-signing-key"), false);
  } finally {
    restoreCredentials();
  }
});

test("Netlify sign function loads the signing module and returns validation errors as JSON", async () => {
  const priorId = process.env.ZKTLS_APP_ID;
  const priorSecret = process.env.ZKTLS_APP_SECRET;
  process.env.ZKTLS_APP_ID = "test-primus-app-id";
  process.env.ZKTLS_APP_SECRET = "test-primus-app-secret";
  try {
    const response = await sign(new Request("https://veriffy.netlify.app/api/primus/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signParams: "{}" })
    }));
    const data = await response.json();
    assert.equal(response.status, 400);
    assert.equal(data.code, "PRIMUS_REQUEST_REJECTED");
    assert.match(data.error, /App ID does not match/);
    assert.equal(JSON.stringify(data).includes("test-primus-app-secret"), false);
  } finally {
    if (priorId === undefined) delete process.env.ZKTLS_APP_ID;
    else process.env.ZKTLS_APP_ID = priorId;
    if (priorSecret === undefined) delete process.env.ZKTLS_APP_SECRET;
    else process.env.ZKTLS_APP_SECRET = priorSecret;
  }
});
