import test from "node:test";
import assert from "node:assert/strict";
import { buildBalanceResponseResolves, calculateThreshold, createBinanceBalanceProof, decimalToUnits } from "../binance.js";

test("converts decimals without floating point rounding", () => {
  assert.equal(decimalToUnits("0.00000001"), 10000000000n);
  assert.equal(decimalToUnits("9007199254740993.12345678"), 9007199254740993123456780000000000n);
});

test("rejects precision that could be silently truncated", () => {
  assert.throws(() => decimalToUnits("1.0000000000000000001"), /precision/);
});

test("threshold compares free plus locked with exact decimal arithmetic", () => {
  assert.equal(calculateThreshold("0.1", "0.2", "0.3"), true);
  assert.equal(calculateThreshold("0.1", "0.19999999", "0.3"), false);
});

test("builds Primus response paths for the exact Binance balance row", () => {
  assert.deepEqual(buildBalanceResponseResolves(3).map(rule => rule.parsePath), [
    "$.balances[3].asset", "$.balances[3].free", "$.balances[3].locked"
  ]);
});

test("creates a verified result without returning the signed request or credentials", async () => {
  let primusRequest;
  const result = await createBinanceBalanceProof({
    apiKey: "private-api-key", apiSecret: "private-api-secret", asset: "USDT", minimum: "10",
    appId: "primus-id", appSecret: "primus-secret",
    fetchAccount: async () => ({ balances: [
      { asset: "BTC", free: "1.0", locked: "0.0" },
      { asset: "USDT", free: "8.25", locked: "2.00" }
    ] }),
    loadPrimus: async () => ({ PrimusCoreTLS: class {
      async init() {}
      generateRequestParams(request, resolves) {
        primusRequest = { request, resolves };
        return { setAttMode() {}, setAdditionParams() {} };
      }
      async startAttestation() {
        return {
          data: JSON.stringify({ asset: "USDT", free: "8.25", locked: "2.00" }),
          timestamp: 123456789,
          attestors: [{ attestorAddr: "0xabc" }],
          request: { url: "https://private.signed.request", header: { "X-MBX-APIKEY": "private-api-key" } }
        };
      }
      verifyAttestation() { return true; }
    } })
  });

  assert.equal(result.thresholdResult, "PASS");
  assert.equal(result.localVerification, true);
  assert.equal(primusRequest.resolves[0].parsePath, "$.balances[1].asset");
  assert.equal(Object.hasOwn(result, "attestation"), false);
  assert.equal(JSON.stringify(result).includes("private-api-key"), false);
  assert.equal(JSON.stringify(result).includes("private-api-secret"), false);
  assert.equal(JSON.stringify(result).includes("private.signed.request"), false);
});

test("does not issue PASS when Primus local signature verification fails", async () => {
  await assert.rejects(() => createBinanceBalanceProof({
    apiKey: "private-api-key", apiSecret: "private-api-secret", asset: "USDT", minimum: "1",
    appId: "primus-id", appSecret: "primus-secret",
    fetchAccount: async () => ({ balances: [{ asset: "USDT", free: "5", locked: "0" }] }),
    loadPrimus: async () => ({ PrimusCoreTLS: class {
      async init() {}
      generateRequestParams() { return { setAttMode() {}, setAdditionParams() {} }; }
      async startAttestation() { return { data: "{}" }; }
      verifyAttestation() { return false; }
    } })
  }), /did not pass local verification/);
});
