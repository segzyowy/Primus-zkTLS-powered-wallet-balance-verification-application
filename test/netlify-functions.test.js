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
    assert.match(signData.error, /Netlify site/);
    assert.equal(Object.hasOwn(signData, "appSecret"), false);
  } finally {
    restoreCredentials();
  }
});
