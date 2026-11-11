import { useState } from "react";
import { ethers } from "ethers";
import { PrimusNetwork } from "@primuslabs/network-js-sdk";
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, CircleHelp, Eye, EyeOff, LockKeyhole, ShieldCheck, Wallet, Globe2, Link2 } from "lucide-react";

const initial = { apiKey: "", apiSecret: "", asset: "USDT", minimum: "100" };
const primusChains = {
  baseSepolia: {
    label: "Base Sepolia (Testnet)",
    chainId: 84532,
    hexChainId: "0x14a34",
    rpcUrl: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    currency: "ETH"
  },
  base: {
    label: "Base Mainnet",
    chainId: 8453,
    hexChainId: "0x2105",
    rpcUrl: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    currency: "ETH"
  }
};
const networkOptions = {
  ethereum: { label: "Ethereum Mainnet", assets: ["ETH", "USDC", "USDT"], native: "ETH" },
  base: { label: "Base Mainnet", assets: ["ETH", "USDC"], native: "ETH" },
  bsc: { label: "BNB Smart Chain", assets: ["BNB", "USDT"], native: "BNB" }
};

export default function App() {
  const [method, setMethod] = useState("wallet");
  const [form, setForm] = useState(initial);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [walletForm, setWalletForm] = useState({ address: "", network: "ethereum", asset: "ETH", minimum: "0.1" });
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletResult, setWalletResult] = useState(null);
  const [walletError, setWalletError] = useState("");
  const [walletConnected, setWalletConnected] = useState(false);
  const [primusTemplateId, setPrimusTemplateId] = useState(import.meta.env.VITE_PRIMUS_WALLET_TEMPLATE_ID || "");
  const [primusChain, setPrimusChain] = useState("baseSepolia");
  const [primusBusy, setPrimusBusy] = useState(false);
  const [primusStep, setPrimusStep] = useState("");
  const [primusResult, setPrimusResult] = useState(null);
  const [primusError, setPrimusError] = useState("");

  function update(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  }

  function updateWallet(event) {
    const { name, value } = event.target;
    if (name === "network") {
      const next = networkOptions[value];
      const nextAsset = next.assets[0];
      setWalletForm(current => ({ ...current, network: value, asset: nextAsset, minimum: nextAsset === next.native ? "0.1" : "100" }));
      setWalletConnected(false);
      setWalletResult(null);
      setWalletError("");
      return;
    }
    if (name === "asset") {
      const native = networkOptions[walletForm.network].native;
      setWalletForm(current => ({ ...current, asset: value, minimum: value === native ? "0.1" : "100" }));
      setWalletResult(null);
      setWalletError("");
      return;
    }
    setWalletForm(current => ({ ...current, [name]: value }));
    if (name === "address") setWalletConnected(false);
    setWalletResult(null);
  }

  async function connectWallet() {
    setWalletError("");
    const provider = window.ethereum;
    if (!provider || typeof provider.request !== "function") {
      setWalletError("No browser wallet was detected. Install MetaMask or enter a public wallet address manually.");
      return;
    }
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || !accounts[0]) throw new Error("The wallet did not return an account.");
      setWalletForm(current => ({ ...current, address: accounts[0] }));
      setWalletConnected(true);
    } catch (reason) {
      setWalletError(reason?.code === 4001 ? "Wallet connection was cancelled." : (reason.message || "Unable to connect your wallet."));
    }
  }

  async function startPrimusAttestation() {
    setPrimusError("");
    setPrimusResult(null);
    if (!walletConnected || !walletForm.address) {
      setPrimusError("Connect your wallet first, then start the Primus attestation.");
      return;
    }
    const templateId = primusTemplateId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(templateId)) {
      setPrimusError("Enter a valid Primus Template ID from the Developer Hub.");
      return;
    }
    if (!window.ethereum || typeof window.ethereum.request !== "function") {
      setPrimusError("A compatible browser wallet is required. Connect MetaMask or another wallet first.");
      return;
    }
    if (!window.primus) {
      setPrimusError("Primus extension was not detected. Install the Primus browser extension (version 0.3.44 or later), then refresh this page.");
      return;
    }

    setPrimusBusy(true);
    setPrimusStep("Preparing wallet connection");
    try {
      const selectedChain = primusChains[primusChain];
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: selectedChain.hexChainId }]
        });
      } catch (switchError) {
        if (switchError?.code !== 4902) throw switchError;
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: selectedChain.hexChainId,
            chainName: selectedChain.label,
            rpcUrls: [selectedChain.rpcUrl],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            blockExplorerUrls: [selectedChain.explorer]
          }]
        });
      }

      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = web3Provider.getSigner();
      const connectedAddress = await signer.getAddress();
      setWalletForm(current => ({ ...current, address: connectedAddress }));
      setWalletConnected(true);

      setPrimusStep("Connecting to Primus Network");
      const primusNetwork = new PrimusNetwork();
      await primusNetwork.init(signer, selectedChain.chainId);

      setPrimusStep("Submitting attestation task on-chain");
      const taskParams = { templateId, address: connectedAddress };
      const submitTaskResult = await primusNetwork.submitTask(taskParams);

      setPrimusStep("Running zkTLS verification in the Primus extension");
      const attestResult = await primusNetwork.attest({
        ...taskParams,
        ...submitTaskResult
      });
      const attestationItem = Array.isArray(attestResult) ? attestResult[0] : null;
      if (!attestationItem) {
        throw new Error("Primus did not return an attestation result.");
      }

      setPrimusStep("Confirming the attestation on-chain");
      const taskResult = await primusNetwork.verifyAndPollTaskResult({
        taskId: attestationItem.taskId,
        reportTxHash: attestationItem.reportTxHash
      });

      let verifiedData = attestationItem?.attestation?.data ?? attestationItem?.data ?? null;
      if (typeof verifiedData === "string") {
        try { verifiedData = JSON.parse(verifiedData); } catch {}
      }

      setPrimusResult({
        chain: selectedChain.label,
        address: connectedAddress,
        taskId: attestationItem.taskId,
        taskTxHash: submitTaskResult?.taskTxHash || "",
        reportTxHash: attestationItem.reportTxHash || "",
        data: verifiedData,
        taskResult
      });
      setPrimusStep("Primus attestation confirmed");
    } catch (reason) {
      const message = reason?.data?.message || reason?.reason || reason?.message || "Primus attestation could not be completed.";
      setPrimusError(message);
      setPrimusStep("");
    } finally {
      setPrimusBusy(false);
    }
  }

  async function submitWallet(event) {
    event.preventDefault();
    setWalletBusy(true);
    setWalletError("");
    setWalletResult(null);
    try {
      const response = await fetch("/api/wallet/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(walletForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Wallet balance lookup failed.");
      setWalletResult(data);
    } catch (reason) {
      setWalletError(reason.message || "Could not retrieve the on-chain balance. Please try again.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/verify/binance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification could not be completed.");
      setResult(data);
      setForm(current => ({ ...current, apiKey: "", apiSecret: "" }));
    } catch (reason) {
      setError(reason.message || "Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const currentNetwork = networkOptions[walletForm.network];

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Proof of Balance home"><span className="brand-mark"><Wallet size={19}/></span><span>proof<span className="brand-dot">.</span></span></a>
      <a className="top-link" href="https://github.com/segzyowy/proof-of-balance" target="_blank" rel="noreferrer">Open source <ArrowUpRight size={15}/></a>
    </header>

    <section className="hero" id="top">
      <div className="eyebrow"><span className="pulse"/> PUBLIC DATA, VERIFIABLE CHECKS</div>
      <h1>Your balance.<br/><span>Your proof.</span></h1>
      <p className="intro">Check an on-chain wallet address or verify a Binance Spot balance. Choose a method and review exactly what the result confirms.</p>
      <div className="trust-row"><span><ShieldCheck size={16}/> Read-only balance lookup</span><i/><span>No asset transfers</span><i/><span>Point-in-time snapshot</span></div>
    </section>

    <div className="method-switch" role="tablist" aria-label="Verification method">
      <button type="button" className={method === "wallet" ? "method-tab active" : "method-tab"} onClick={() => { setMethod("wallet"); setWalletError(""); }} role="tab" aria-selected={method === "wallet"}><Wallet size={16}/> Wallet</button>
      <button type="button" className={method === "binance" ? "method-tab active" : "method-tab"} onClick={() => { setMethod("binance"); setError(""); }} role="tab" aria-selected={method === "binance"}><Globe2 size={16}/> Binance</button>
    </div>

    <section className="workspace">
      {method === "wallet" ? <form className="card form-card" onSubmit={submitWallet}>
        <div className="card-head"><div className="step">01</div><div><h2>Check a wallet balance</h2><p>Connect a browser wallet or enter a public address.</p></div></div>
        <button className="connect-wallet-btn" type="button" onClick={connectWallet}><Wallet size={16}/>{walletConnected ? "Wallet connected" : "Connect wallet"}</button>
        <div className="or-divider"><span>OR ENTER A PUBLIC ADDRESS</span></div>
        <label htmlFor="walletAddress">Public wallet address</label>
        <input id="walletAddress" name="address" autoComplete="off" spellCheck="false" value={walletForm.address} onChange={updateWallet} placeholder="0x..." required maxLength={42}/>
        <div className="field-row wallet-fields">
          <div><label htmlFor="walletNetwork">Network</label><div className="select-wrap"><select id="walletNetwork" name="network" value={walletForm.network} onChange={updateWallet}><option value="ethereum">Ethereum Mainnet</option><option value="base">Base Mainnet</option><option value="bsc">BNB Smart Chain</option></select><ChevronDown size={16}/></div></div>
          <div><label htmlFor="walletAsset">Asset</label><div className="select-wrap"><select id="walletAsset" name="asset" value={walletForm.asset} onChange={updateWallet}>{currentNetwork.assets.map(asset => <option key={asset} value={asset}>{asset}</option>)}</select><ChevronDown size={16}/></div></div>
        </div>
        <label htmlFor="walletMinimum">Minimum balance ({walletForm.asset})</label>
        <input id="walletMinimum" name="minimum" inputMode="decimal" value={walletForm.minimum} onChange={updateWallet} placeholder="Enter minimum balance" required/>
        <div className="privacy-note"><LockKeyhole size={16}/><p>This balance lookup is read-only: no seed phrase, private key, signature or transaction is needed. The separate Primus panel below submits an on-chain task and requires gas on Base.</p></div>
        {walletError && <div className="error-box" role="alert">{walletError}</div>}
        <button className="primary-btn" disabled={walletBusy}>{walletBusy ? <><span className="spinner"/> Checking on-chain balance…</> : <>Check wallet balance <ArrowUpRight size={17}/></>}</button>
        <p className="key-tip">This checks the selected network only. A balance lookup does not prove you control the address.</p>

        <div className="primus-panel">
          <div className="primus-panel-heading">
            <div className="primus-panel-icon"><ShieldCheck size={18}/></div>
            <div><h3>Primus zkTLS wallet attestation</h3><p>Use your connected wallet to submit and verify a Primus Network task.</p></div>
          </div>
          <label htmlFor="primusTemplateId">Primus Template ID</label>
          <input
            id="primusTemplateId"
            value={primusTemplateId}
            onChange={event => { setPrimusTemplateId(event.target.value); setPrimusResult(null); setPrimusError(""); }}
            placeholder="Paste the Template ID from Primus Developer Hub"
            spellCheck="false"
            autoComplete="off"
          />
          <label htmlFor="primusChain">Primus network</label>
          <div className="select-wrap">
            <select id="primusChain" value={primusChain} onChange={event => { setPrimusChain(event.target.value); setPrimusResult(null); setPrimusError(""); }}>
              <option value="baseSepolia">Base Sepolia — testnet</option>
              <option value="base">Base Mainnet</option>
            </select>
            <ChevronDown size={16}/>
          </div>
          <div className="primus-disclaimer">
            <LockKeyhole size={15}/>
            <p>Primus uses your connected wallet to submit an on-chain task and the browser extension to perform zkTLS. You will be asked to approve a transaction and need ETH for gas on the selected Base network. This template attests off-chain website data; it does not replace the separate on-chain wallet balance lookup above.</p>
          </div>
          {primusStep && <div className="primus-progress" role="status"><span className={primusBusy ? "spinner" : "primus-progress-check"}>{primusBusy ? "" : "✓"}</span>{primusStep}</div>}
          {primusError && <div className="error-box" role="alert">{primusError} <a href="https://chromewebstore.google.com/detail/primus-prev-pado/oeiomhmbaapihbilkfkhmlajkeegnjhe" target="_blank" rel="noreferrer">Get Primus extension</a></div>}
          {primusResult && <div className="primus-result">
            <div className="primus-result-title"><Check size={16}/> Attestation confirmed on {primusResult.chain}</div>
            <div className="primus-result-meta"><span>Wallet</span><b>{shortAddress(primusResult.address)}</b></div>
            {primusResult.taskTxHash && <div className="primus-result-meta"><span>Task transaction</span><a href={primusChains[primusChain].explorer + "/tx/" + primusResult.taskTxHash} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={12}/></a></div>}
            {primusResult.reportTxHash && <div className="primus-result-meta"><span>Attestation transaction</span><a href={primusChains[primusChain].explorer + "/tx/" + primusResult.reportTxHash} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={12}/></a></div>}
            <span className="primus-data-label">VERIFIED TEMPLATE DATA</span>
            <pre>{JSON.stringify(primusResult.data ?? primusResult.taskResult ?? { status: "Confirmed" }, null, 2)}</pre>
          </div>}
          <button className="primus-action-btn" type="button" onClick={startPrimusAttestation} disabled={primusBusy || !walletConnected}>
            {primusBusy ? <><span className="spinner"/> {primusStep || "Verifying with Primus…"}</> : <><ShieldCheck size={16}/> {primusResult ? "Run another Primus attestation" : "Verify with Primus zkTLS"} <ArrowUpRight size={15}/></>}
          </button>
          {!walletConnected && <p className="primus-hint">Connect your wallet above to enable the Primus verification flow.</p>}
          <p className="primus-hint">You need the Primus browser extension (version 0.3.44 or later). <a href="https://chromewebstore.google.com/detail/primus-prev-pado/oeiomhmbaapihbilkfkhmlajkeegnjhe" target="_blank" rel="noreferrer">Install extension</a>.</p>
        </div>
      </form> : <form className="card form-card" onSubmit={submit}>
        <div className="card-head"><div className="step">01</div><div><h2>Set up your Binance proof</h2><p>Use a dedicated Binance key with read permission only.</p></div></div>
        <label htmlFor="apiKey">Binance API key</label>
        <input id="apiKey" name="apiKey" autoComplete="off" value={form.apiKey} onChange={update} placeholder="Paste your read-only API key" required minLength={8} maxLength={256}/>
        <label htmlFor="apiSecret">API secret</label>
        <div className="secret-wrap"><input id="apiSecret" name="apiSecret" autoComplete="new-password" type={showSecret ? "text" : "password"} value={form.apiSecret} onChange={update} placeholder="Used only for this request" required minLength={8} maxLength={256}/><button className="icon-btn" type="button" aria-label={showSecret ? "Hide API secret" : "Show API secret"} onClick={() => setShowSecret(value => !value)}>{showSecret ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
        <div className="field-row">
          <div><label htmlFor="asset">Asset</label><div className="select-wrap"><select id="asset" name="asset" value={form.asset} onChange={update}><option>USDT</option><option>BTC</option><option>ETH</option><option>BNB</option><option>USDC</option></select><ChevronDown size={16}/></div></div>
          <div><label htmlFor="minimum">Minimum balance</label><input id="minimum" name="minimum" inputMode="decimal" value={form.minimum} onChange={update} required/></div>
        </div>
        <div className="privacy-note"><LockKeyhole size={16}/><p>Your Binance credentials are sent to this app’s server for verification and cleared from this form when the request completes. They are not saved by the app. Only use this on a server you trust.</p></div>
        {error && <div className="error-box" role="alert">{error}</div>}
        <button className="primary-btn" disabled={busy}>{busy ? <><span className="spinner"/> Generating proof…</> : <>Verify Binance balance <ArrowUpRight size={17}/></>}</button>
        <p className="key-tip">Never enable trading or withdrawals on this API key. <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noreferrer">Manage API keys <ArrowUpRight size={12}/></a></p>
      </form>}

      <section className="card result-card" aria-live="polite">
        {method === "wallet" ? (walletResult ? <div className="proof-result">
          <div className="result-top"><div className="result-icon"><Check size={22}/></div><div><span className="step-label">ON-CHAIN BALANCE CHECK</span><h2>{walletResult.thresholdResult === "PASS" ? "Threshold met" : "Below threshold"}</h2></div><span className={"status " + walletResult.thresholdResult.toLowerCase()}>{walletResult.thresholdResult}</span></div>
          <div className="balance-total"><span>{walletResult.asset} on {walletResult.network}</span><strong>{walletResult.balance} <small>{walletResult.asset}</small></strong></div>
          <div className="balance-lines"><div><span>Minimum</span><b>{walletResult.minimum} {walletResult.asset}</b></div><div><span>Network</span><b>{walletResult.network}</b></div><div><span>Wallet</span><b>{shortAddress(walletResult.walletAddress)}</b></div></div>
          <div className="proof-meta"><div><span>Block number</span><b>{walletResult.blockNumber}</b></div><div><span>Checked</span><b>{new Date(walletResult.checkedAt).toLocaleString()}</b></div><div><span>RPC source</span><b>{walletResult.rpcProvider}</b></div></div>
          <div className="boundary verified"><CircleHelp size={16}/><span>{walletResult.verifiesWhat} {walletResult.doesNotVerify}</span></div>
          <a className="secondary-btn" href={walletResult.explorerUrl} target="_blank" rel="noreferrer"><Link2 size={15}/> View address on block explorer <ArrowUpRight size={13}/></a>
          <button className="secondary-btn reset-btn" type="button" onClick={() => { setWalletResult(null); setWalletError(""); }}><ArrowDownToLine size={15}/> Check another address</button>
        </div> : <div className="empty-state"><div className="empty-icon"><Wallet size={25}/></div><span className="step-label">02 — WALLET RESULT</span><h2>Your wallet check will appear here</h2><p>We’ll read the selected asset balance from the chosen public EVM network at a specific block, then compare it with your minimum.</p><div className="result-skeleton"><span/><span/><span/></div><div className="boundary"><CircleHelp size={16}/><span>This is a public RPC balance lookup, not a cryptographic proof or proof that you control the address.</span></div></div>) : (result ? <div className="proof-result">
          <div className="result-top"><div className="result-icon"><Check size={22}/></div><div><span className="step-label">PRIMUS ATTESTATION VERIFIED</span><h2>{result.thresholdResult === "PASS" ? "Threshold met" : "Below threshold"}</h2></div><span className={"status " + result.thresholdResult.toLowerCase()}>{result.thresholdResult}</span></div>
          <div className="balance-total"><span>{result.asset} Spot balance</span><strong>{formatAmount(result.free, result.locked)} <small>{result.asset}</small></strong></div>
          <div className="balance-lines"><div><span>Available</span><b>{result.free} {result.asset}</b></div><div><span>Locked</span><b>{result.locked} {result.asset}</b></div><div><span>Minimum</span><b>{result.minimum} {result.asset}</b></div></div>
          <div className="proof-meta"><div><span>Source</span><b>Binance Spot account</b></div><div><span>Attested</span><b>{new Date(result.attestedAt).toLocaleString()}</b></div><div><span>Attestors</span><b>{result.attestorCount || "Verified locally"}</b></div></div>
          <div className="boundary verified"><ShieldCheck size={16}/><span>{result.verifiesWhat} {result.doesNotVerify}</span></div>
          <button className="secondary-btn" type="button" onClick={() => { setResult(null); setError(""); }}><ArrowDownToLine size={15}/> Start another check</button>
        </div> : <div className="empty-state"><div className="empty-icon"><ShieldCheck size={25}/></div><span className="step-label">02 — BINANCE RESULT</span><h2>Your Binance proof will appear here</h2><p>We’ll verify the authenticated Binance response with Primus, then compare free + locked Spot balance against your threshold.</p><div className="result-skeleton"><span/><span/><span/></div><div className="boundary"><CircleHelp size={16}/><span>Exact balance values are visible in this MVP. This is not a threshold-only zero-knowledge proof.</span></div></div>)}
      </section>
    </section>
    <footer><span>Built for transparent verification.</span><span>{method === "wallet" ? "EVM JSON-RPC" : "Primus zkTLS"} <i/> {method === "wallet" ? "Ethereum · Base · BNB Chain" : "Binance Spot"}</span></footer>
  </main>;
}

function shortAddress(address) {
  return address ? address.slice(0, 6) + "…" + address.slice(-4) : "";
}

function formatAmount(free, locked) {
  const [wholeA, fractionA = ""] = String(free).split(".");
  const [wholeB, fractionB = ""] = String(locked).split(".");
  const scale = Math.max(fractionA.length, fractionB.length);
  const units = BigInt(wholeA) * 10n ** BigInt(scale) + BigInt((fractionA + "0".repeat(scale)).slice(0, scale)) +
    BigInt(wholeB) * 10n ** BigInt(scale) + BigInt((fractionB + "0".repeat(scale)).slice(0, scale));
  const base = 10n ** BigInt(scale);
  const whole = (units / base).toString();
  const fraction = scale ? (units % base).toString().padStart(scale, "0").replace(/0+$/, "") : "";
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? "." + fraction : "");
}
