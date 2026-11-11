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

test("health endpoint reports app status without exposing secrets", async () => {
  await withServer(async base => {
    const response = await fetch(base + "/api/health");
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.app, "proof-of-balance");
    assert.equal(Object.hasOwn(data, "appSecret"), false);
    assert.equal(Object.hasOwn(data, "apiKey"), false);
  });
});

test("verification refuses requests without server-side Primus credentials", async () => {
  await withServer(async base => {
    const response = await fetch(base + "/api/verify/binance", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "placeholder-key", apiSecret: "placeholder-secret", asset: "USDT", minimum: "100" })
    });
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.match(data.error, /Primus is not configured/);
    assert.equal(JSON.stringify(data).includes("placeholder"), false);
  });
});

test("wallet balance endpoint rejects invalid addresses before querying an RPC", async () => {
  await withServer(async base => {
    const response = await fetch(base + "/api/wallet/balance", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: "not-a-wallet", network: "ethereum", asset: "ETH", minimum: "0.1" })
    });
    const data = await response.json();
    assert.equal(response.status, 400);
    assert.match(data.error, /valid EVM wallet address/);
  });
});
