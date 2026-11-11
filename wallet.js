const NETWORKS = {
  ethereum: {
    name: "Ethereum Mainnet",
    chainId: 1,
    nativeSymbol: "ETH",
    rpc: "https://ethereum-rpc.publicnode.com",
    rpcProvider: "PublicNode",
    explorer: "https://etherscan.io/address/",
    tokens: {
      USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, label: "USD Coin" },
      USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, label: "Tether USD" }
    }
  },
  base: {
    name: "Base Mainnet",
    chainId: 8453,
    nativeSymbol: "ETH",
    rpc: "https://mainnet.base.org",
    rpcProvider: "Base public RPC",
    explorer: "https://basescan.org/address/",
    tokens: {
      USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, label: "USD Coin" }
    }
  },
  bsc: {
    name: "BNB Smart Chain",
    chainId: 56,
    nativeSymbol: "BNB",
    rpc: "https://bsc-dataseed.bnbchain.org",
    rpcProvider: "BNB Chain public RPC",
    explorer: "https://bscscan.com/address/",
    tokens: {
      USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, label: "Tether USD (Binance-Peg)" }
    }
  }
};

export function isEvmAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function decimalToUnits(value, decimals) {
  const text = String(value ?? "").trim();
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Invalid token decimals.");
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error("Enter a valid positive decimal amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error("The minimum amount has too many decimal places for this asset.");
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function formatUnits(units, decimals) {
  const value = BigInt(units);
  const base = 10n ** BigInt(decimals);
  const whole = (value / base).toString();
  const fraction = decimals ? (value % base).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? "." + fraction : "");
}

async function rpcCall(endpoint, method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!response.ok) throw new Error("The selected blockchain RPC returned HTTP " + response.status + ".");
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "The blockchain RPC request failed.");
  if (!Object.prototype.hasOwnProperty.call(payload, "result")) throw new Error("The blockchain RPC response was incomplete.");
  return payload.result;
}

export async function getOnchainBalance({ address, network, asset, minimum, rpc = rpcCall }) {
  const walletAddress = String(address ?? "").trim();
  if (!isEvmAddress(walletAddress)) throw new Error("Enter a valid EVM wallet address starting with 0x.");
  const chain = NETWORKS[network];
  if (!chain) throw new Error("Choose a supported network.");
  const symbol = String(asset ?? "").trim().toUpperCase();
  const token = symbol === chain.nativeSymbol ? null : chain.tokens[symbol];
  if (symbol !== chain.nativeSymbol && !token) throw new Error(symbol + " is not supported on " + chain.name + ".");
  const decimals = token ? token.decimals : 18;
  const minimumUnits = decimalToUnits(minimum, decimals);
  if (minimumUnits <= 0n) throw new Error("Minimum balance must be greater than zero.");

  const [actualChainHex, blockHex] = await Promise.all([
    rpc(chain.rpc, "eth_chainId", []),
    rpc(chain.rpc, "eth_blockNumber", [])
  ]);
  if (BigInt(actualChainHex) !== BigInt(chain.chainId)) throw new Error("The configured RPC endpoint returned an unexpected network. No balance result was issued.");
  if (typeof blockHex !== "string" || !/^0x[0-9a-fA-F]+$/.test(blockHex)) throw new Error("The blockchain RPC returned an invalid block number.");

  let rawBalance;
  if (token) {
    const callData = "0x70a08231" + walletAddress.slice(2).toLowerCase().padStart(64, "0");
    rawBalance = await rpc(chain.rpc, "eth_call", [{ to: token.address, data: callData }, blockHex]);
  } else {
    rawBalance = await rpc(chain.rpc, "eth_getBalance", [walletAddress, blockHex]);
  }
  if (typeof rawBalance !== "string" || !/^0x[0-9a-fA-F]+$/.test(rawBalance)) {
    throw new Error("The blockchain RPC returned an invalid balance. No result was issued.");
  }

  const balanceUnits = BigInt(rawBalance);
  const passes = balanceUnits >= minimumUnits;
  const balance = formatUnits(balanceUnits, decimals);
  const min = formatUnits(minimumUnits, decimals);
  const blockNumber = BigInt(blockHex).toString();

  return {
    provider: "EVM JSON-RPC",
    verificationType: "public-address-onchain-read",
    network: chain.name,
    networkKey: network,
    chainId: chain.chainId,
    walletAddress,
    asset: symbol,
    assetLabel: token ? token.label : chain.nativeSymbol,
    tokenContract: token?.address ?? null,
    balance,
    minimum: min,
    thresholdResult: passes ? "PASS" : "FAIL",
    blockNumber,
    blockTag: blockHex,
    checkedAt: new Date().toISOString(),
    rpcProvider: chain.rpcProvider,
    explorerUrl: chain.explorer + walletAddress,
    proofType: "public-rpc-read",
    verifiesWhat: "A public EVM JSON-RPC endpoint returned this address balance for " + chain.name + " at block " + blockNumber + ". The application compared it with the requested minimum.",
    doesNotVerify: "This read does not prove that the person using this app controls the address. It is not a Primus attestation, cryptographic inclusion proof, or threshold-only zero-knowledge proof. RPC providers are trusted for the returned data.",
  };
}

export function getWalletNetworkOptions() {
  return Object.entries(NETWORKS).map(([key, network]) => ({
    key,
    name: network.name,
    chainId: network.chainId,
    nativeSymbol: network.nativeSymbol,
    assets: [network.nativeSymbol, ...Object.keys(network.tokens)]
  }));
}
