import test from "node:test";
import assert from "node:assert/strict";
import { decimalToUnits, formatUnits, getOnchainBalance, isEvmAddress } from "../wallet.js";

test("validates EVM public addresses", () => {
  assert.equal(isEvmAddress("0x0000000000000000000000000000000000000001"), true);
  assert.equal(isEvmAddress("not-an-address"), false);
});

test("converts and formats token amounts without floating point arithmetic", () => {
  assert.equal(decimalToUnits("1.25", 6), 1250000n);
  assert.equal(formatUnits(1250000n, 6), "1.25");
  assert.equal(formatUnits(0n, 18), "0");
  assert.throws(() => decimalToUnits("1.0000001", 6), /too many decimal places/);
});

test("checks a native ETH balance at a fixed block and compares threshold exactly", async () => {
  const calls = [];
  const result = await getOnchainBalance({
    address: "0x0000000000000000000000000000000000000001",
    network: "ethereum",
    asset: "ETH",
    minimum: "0.005",
    rpc: async (_endpoint, method, params) => {
      calls.push({ method, params });
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_blockNumber") return "0x1234";
      if (method === "eth_getBalance") return "0x2386f26fc10000";
      throw new Error("Unexpected RPC method " + method);
    }
  });
  assert.equal(result.balance, "0.01");
  assert.equal(result.thresholdResult, "PASS");
  assert.equal(result.blockNumber, "4660");
  assert.equal(calls.find(call => call.method === "eth_getBalance").params[1], "0x1234");
});

test("checks ERC-20 balanceOf with a valid ABI call", async () => {
  let callParams;
  const result = await getOnchainBalance({
    address: "0x0000000000000000000000000000000000000001",
    network: "base",
    asset: "USDC",
    minimum: "100",
    rpc: async (_endpoint, method, params) => {
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_blockNumber") return "0x200";
      if (method === "eth_call") {
        callParams = params;
        return "0x" + (125000000n).toString(16).padStart(64, "0");
      }
      throw new Error("Unexpected RPC method " + method);
    }
  });
  assert.equal(result.balance, "125");
  assert.equal(result.thresholdResult, "PASS");
  assert.equal(callParams[0].data.slice(0, 10), "0x70a08231");
  assert.equal(callParams[1], "0x200");
});

test("rejects a mismatched RPC chain id without returning a balance", async () => {
  await assert.rejects(() => getOnchainBalance({
    address: "0x0000000000000000000000000000000000000001",
    network: "base",
    asset: "ETH",
    minimum: "0.1",
    rpc: async (_endpoint, method) => method === "eth_chainId" ? "0x1" : "0x10"
  }), /unexpected network/);
});

test("rejects unsupported token/network combinations", async () => {
  await assert.rejects(() => getOnchainBalance({
    address: "0x0000000000000000000000000000000000000001",
    network: "base",
    asset: "USDT",
    minimum: "1",
    rpc: async () => { throw new Error("RPC should not be called"); }
  }), /not supported/);
});
