import crypto from "node:crypto";

const BINANCE_BASE = "https://api.binance.com";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function decimalToUnits(value, scale = 18) {
  const [whole, fraction = ""] = String(value).split(".");
  if (fraction.length > scale || !/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) {
    throw new Error("Invalid decimal precision.");
  }
  return BigInt(whole) * (10n ** BigInt(scale)) +
    BigInt((fraction + "0".repeat(scale)).slice(0, scale));
}

export function buildBalanceResponseResolves(rowIndex) {
  return [
    { keyName: "asset", parseType: "json", parsePath: `$.balances[${rowIndex}].asset` },
    { keyName: "free", parseType: "json", parsePath: `$.balances[${rowIndex}].free` },
    { keyName: "locked", parseType: "json", parsePath: `$.balances[${rowIndex}].locked` }
  ];
}

export function calculateThreshold(free, locked, minimum) {
  return decimalToUnits(free) + decimalToUnits(locked) >= decimalToUnits(minimum);
}

function signQuery(params, secret) {
  const query = new URLSearchParams(params).toString();
  const signature = crypto.createHmac("sha256", secret).update(query).digest("hex");
  return `${query}&signature=${signature}`;
}

async function getBinanceAccount(apiKey, apiSecret) {
  const params = new URLSearchParams({
    omitZeroBalances: "false",
    recvWindow: "5000",
    timestamp: String(Date.now())
  });
  const signed = signQuery(params, apiSecret);
  const response = await fetch(`${BINANCE_BASE}/api/v3/account?${signed}`, {
    method: "GET",
    headers: { "X-MBX-APIKEY": apiKey, "Accept": "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = new Error(`Binance rejected the request (${response.status}).`);
    e.publicMessage = body?.msg
      ? `Binance: ${body.msg} (code ${body.code ?? response.status}). Check that the API key has read permission and the IP is allowed.`
      : `Binance rejected the request (${response.status}). Check your read-only API key and IP restrictions.`;
    throw e;
  }
  if (!Array.isArray(body?.balances)) throw new Error("Unexpected Binance account response.");
  return body;
}

export async function createBinanceBalanceProof({
  apiKey, apiSecret, asset, minimum, appId, appSecret,
  fetchAccount = getBinanceAccount,
  loadPrimus = () => import("@primuslabs/zktls-core-sdk")
}) {
  // First request locates the selected asset row so the Primus response rules
  // disclose only that row's asset/free/locked fields.
  const account = await fetchAccount(apiKey, apiSecret);
  const rowIndex = account.balances.findIndex(row => row.asset === asset);
  if (rowIndex < 0) {
    const e = new Error("Asset was not present in the Binance account response.");
    e.publicMessage = `${asset} was not found in this Binance account. Try another asset symbol.`;
    throw e;
  }

  const timestamp = Date.now();
  const params = new URLSearchParams({
    omitZeroBalances: "false",
    recvWindow: "5000",
    timestamp: String(timestamp)
  });
  const query = params.toString();
  const signature = crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
  const request = {
    url: `${BINANCE_BASE}/api/v3/account?${query}&signature=${signature}`,
    method: "GET",
    header: { "X-MBX-APIKEY": apiKey, "Accept": "application/json" },
    body: ""
  };

  const responseResolves = buildBalanceResponseResolves(rowIndex);

  const { PrimusCoreTLS } = await loadPrimus();
  const zkTLS = new PrimusCoreTLS();
  await zkTLS.init(appId, appSecret, "auto");
  const attRequest = zkTLS.generateRequestParams(request, responseResolves, ZERO_ADDRESS);
  attRequest.setAttMode({ algorithmType: "proxytls", resultType: "plain" });
  attRequest.setAdditionParams(JSON.stringify({
    scene: "proof-of-balance-binance-spot",
    asset,
    claim: `Binance Spot ${asset} balance snapshot`
  }));

  const attestation = await zkTLS.startAttestation(attRequest, 120_000);
  const localVerification = await Promise.resolve(zkTLS.verifyAttestation(attestation));
  if (localVerification !== true) {
    const e = new Error("Primus returned an attestation that did not pass local verification.");
    e.publicMessage = "Primus attestation was generated but did not pass local signature verification. No PASS result was issued.";
    throw e;
  }

  let extracted = {};
  try {
    extracted = JSON.parse(attestation.data || "{}");
    for (const [key, value] of Object.entries(extracted)) {
      if (typeof value === "string") {
        try { extracted[key] = JSON.parse(value); } catch {}
      }
    }
  } catch {
    throw new Error("Could not parse the attested balance fields.");
  }

  const free = String(extracted.free ?? "");
  const locked = String(extracted.locked ?? "");
  const attestedAsset = String(extracted.asset ?? "");
  if (attestedAsset !== asset || !/^\d+(?:\.\d+)?$/.test(free) || !/^\d+(?:\.\d+)?$/.test(locked)) {
    throw new Error("Attested response did not contain the expected asset balance fields.");
  }

  const passes = calculateThreshold(free, locked, minimum);

  return {
    provider: "Binance",
    proofStatus: "attested",
    localVerification: true,
    claim: `Binance Spot ${asset} balance snapshot`,
    asset,
    minimum,
    free,
    locked,
    thresholdResult: passes ? "PASS" : "FAIL",
    attestedAt: attestation.timestamp ?? Date.now(),
    attestorCount: Array.isArray(attestation.attestors) ? attestation.attestors.length : 0,
    proofType: "partial",
    verifiesWhat: "The selected asset, free balance and locked balance fields were extracted from an attested Binance HTTPS account response and the Primus signature passed local verification. The application compared free + locked against the requested minimum.",
    doesNotVerify: "This MVP does not hide the raw balance values inside the attestation, prove ownership of funds beyond the authenticated Binance account response, cover other account products such as Earn/Margin/Futures, or guarantee the balance remains unchanged after the snapshot.",
  };
}
