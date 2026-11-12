import test from "node:test";
import assert from "node:assert/strict";
import app from "../index.js";

async function withServer(callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    await callback("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("health endpoint reports Primus configuration without exposing secrets", async () => {
  await withServer(async base => {
    const response = await fetch(base + "/api/health");
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.app, "proof-of-balance");
    assert.equal(data.walletIntegration, false);
    assert.equal(Object.hasOwn(data, "appSecret"), false);
    assert.equal(Object.hasOwn(data, "apiKey"), false);
  });
});

test("Primus config endpoint never returns the App Secret", async () => {
  await withServer(async base => {
    const response = await fetch(base + "/api/primus/config");
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.match(data.error, /Primus is not configured/);
    assert.equal(Object.hasOwn(data, "appSecret"), false);
  });
});

test("Primus signing endpoint refuses requests when server-side credentials are absent", async () => {
  await withServer(async base => {
    const response = await fetch(base + "/api/primus/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signParams: "{}" })
    });
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.match(data.error, /Primus is not configured/);
    assert.equal(JSON.stringify(data).includes("appSecret"), false);
  });
});

test("wallet and old Binance API integration routes are no longer exposed", async () => {
  await withServer(async base => {
    const walletResponse = await fetch(base + "/api/wallet/balance", { method: "POST" });
    const oldBinanceResponse = await fetch(base + "/api/verify/binance", { method: "POST" });
    assert.equal(walletResponse.status, 404);
    assert.equal(oldBinanceResponse.status, 404);
  });
});
