import { useState } from "react";
import { ethers } from "ethers";
import { PrimusNetwork } from "@primuslabs/network-js-sdk";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, ChevronDown, CircleHelp, LockKeyhole, ShieldCheck, Wallet, Link2 } from "lucide-react";

const BINANCE_ICON = "https://storage.googleapis.com/primuslabs-online/developer-center/website-icon/binance.png";
const BINANCE_TEMPLATES = {
  pnl: {
    key: "pnl",
    icon: BINANCE_ICON,
    title: "7-Day Spot Account PnL Rate",
    description: "Verify the user’s last 7-day spot account PnL rate.",
    templateId: "67ed246d-ff00-47d5-9026-5ff09cbdd65b",
    sourceUrl: "https://www.binance.com/en/my/pnl/spot_account/",
    requestUrl: "https://www.binance.com/bapi/composite/v1/private/bigdata/finance/spot-statistics",
    dataKey: "spotPnlRate",
    jsonPath: "$.data.cumulativeCurrWeek.spotPnlRate",
    sourceLabel: "Open Binance Spot PnL"
  },
  trades: {
    key: "trades",
    icon: BINANCE_ICON,
    title: "7-Day Spot Trade History",
    description: "Verify the user’s 30-day spot trade history on Binance.",
    templateId: "c25c9f6a-b816-4a67-86ab-7292eff209a3",
    sourceUrl: "https://www.binance.com/en/my/orders/exchange/usertrade",
    requestUrl: "https://www.binance.com/bapi/capital/v1/private/streamer/trade/get-user-trades",
    dataKey: "data",
    jsonPath: "$.data",
    sourceLabel: "Open Binance Spot Trade History"
  }
};
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
  const [method, setMethod] = useState("binance");
  const [walletForm, setWalletForm] = useState({ address: "", network: "ethereum", asset: "ETH", minimum: "0.1" });
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletResult, setWalletResult] = useState(null);
  const [walletError, setWalletError] = useState("");
  const [walletConnected, setWalletConnected] = useState(false);
  const [primusChain, setPrimusChain] = useState("baseSepolia");
  const [selectedBinanceTemplateKey, setSelectedBinanceTemplateKey] = useState(null);
  const [primusBusy, setPrimusBusy] = useState(false);
  const [primusStep, setPrimusStep] = useState("");
  const [primusResult, setPrimusResult] = useState(null);
  const [primusError, setPrimusError] = useState("");

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
    const selectedTemplate = selectedBinanceTemplateKey ? BINANCE_TEMPLATES[selectedBinanceTemplateKey] : null;
    if (!selectedTemplate) {
      setPrimusError("Choose a Binance template first.");
      return;
    }
    const templateId = selectedTemplate.templateId;
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

      const templateValue = getJsonPathValue(verifiedData, selectedTemplate.jsonPath);
      if (templateValue === undefined || templateValue === null) {
        throw new Error(`The attestation was confirmed, but the configured field ${selectedTemplate.jsonPath} was not found in the returned template data.`);
      }

      setPrimusResult({
        templateKey: selectedTemplate.key,
        templateTitle: selectedTemplate.title,
        dataKey: selectedTemplate.dataKey,
        jsonPath: selectedTemplate.jsonPath,
        chain: selectedChain.label,
        address: connectedAddress,
        taskId: attestationItem.taskId,
        taskTxHash: submitTaskResult?.taskTxHash || "",
        reportTxHash: attestationItem.reportTxHash || "",
        data: verifiedData,
        value: templateValue,
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

  const currentNetwork = networkOptions[walletForm.network];

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Proof of Balance home"><span className="brand-mark"><Wallet size={19}/></span><span>proof<span className="brand-dot">.</span></span></a>
      <a className="top-link" href="https://github.com/segzyowy/proof-of-balance" target="_blank" rel="noreferrer">Open source <ArrowUpRight size={15}/></a>
    </header>

    <section className="hero" id="top">
      <div className="eyebrow"><span className="pulse"/> PUBLIC DATA, VERIFIABLE CHECKS</div>
      <h1>Your account.<br/><span>Your proof.</span></h1>
      <p className="intro">Use Primus zkTLS to verify Binance Spot account PnL or Spot trade-history data, or check a public on-chain wallet balance.</p>
      <div className="trust-row"><span><ShieldCheck size={16}/> User-authorised checks</span><i/><span>No asset transfers</span><i/><span>Attested source data</span></div>
    </section>

    <div className="method-switch" role="tablist" aria-label="Verification method">
      <button type="button" className={method === "wallet" ? "method-tab active" : "method-tab"} onClick={() => { setMethod("wallet"); setWalletError(""); }} role="tab" aria-selected={method === "wallet"}><Wallet size={16}/> Wallet balance</button>
      <button type="button" className={method === "binance" ? "method-tab active" : "method-tab"} onClick={() => { setMethod("binance"); setPrimusError(""); }} role="tab" aria-selected={method === "binance"}><img className="binance-mini-logo" src={BINANCE_ICON} alt="" /> Binance templates</button>
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
        <div className="privacy-note"><LockKeyhole size={16}/><p>This wallet balance lookup is read-only: no seed phrase, private key or signature is needed. The separate Binance PnL template uses Primus and requires a wallet transaction for task submission.</p></div>
        {walletError && <div className="error-box" role="alert">{walletError}</div>}
        <button className="primary-btn" disabled={walletBusy}>{walletBusy ? <><span className="spinner"/> Checking on-chain balance…</> : <>Check wallet balance <ArrowUpRight size={17}/></>}</button>
        <p className="key-tip">This checks the selected network only. A balance lookup does not prove you control the address.</p>

      </form> : <section className="card form-card binance-pnl-card">
        {selectedBinanceTemplateKey ? (() => {
          const template = BINANCE_TEMPLATES[selectedBinanceTemplateKey];
          return <>
            <button className="template-back-btn" type="button" onClick={() => { setSelectedBinanceTemplateKey(null); setPrimusResult(null); setPrimusError(""); setPrimusStep(""); }}>
              <ArrowLeft size={15}/> Back
            </button>
            <div className="binance-template-heading">
              <img src={template.icon} alt="Binance" className="binance-logo" />
              <div>
                <span className="template-eyebrow">BINANCE · PRIMUS ZKTLS</span>
                <h2>{template.title}</h2>
                <p>{template.description}</p>
              </div>
            </div>

            <div className="template-try-row">
              <span className="template-status"><ShieldCheck size={14}/> Template ID configured</span>
              <button className="primus-action-btn template-try-btn" type="button" onClick={startPrimusAttestation} disabled={primusBusy || !walletConnected}>
                {primusBusy ? <><span className="spinner"/> {primusStep || "Verifying…"}</> : <>Try <ArrowUpRight size={15}/></>}
              </button>
            </div>

            <div className="template-details">
              <h3>Template details</h3>
              <div className="template-detail-row"><span>Template ID</span><code>{template.templateId}</code></div>
              <div className="template-detail-row"><span>Data source URL</span><a href={template.sourceUrl} target="_blank" rel="noreferrer">{template.sourceLabel} <ArrowUpRight size={12}/></a></div>
              <div className="template-detail-row template-url-row"><span>Request URL</span><a href={template.requestUrl} target="_blank" rel="noreferrer">{template.requestUrl} <ArrowUpRight size={12}/></a></div>
              <div className="template-data-item">
                <span>Data items (jsonPath)</span>
                <strong>{template.dataKey}</strong>
                <code>{template.jsonPath}</code>
              </div>
            </div>

            <div className="template-connect">
              <button className="connect-wallet-btn" type="button" onClick={connectWallet}>
                <Wallet size={16}/>{walletConnected ? "Wallet connected" : "Connect wallet to continue"}
              </button>
              <label htmlFor="primusChain">Primus network</label>
              <div className="select-wrap">
                <select id="primusChain" value={primusChain} onChange={event => { setPrimusChain(event.target.value); setPrimusResult(null); setPrimusError(""); }}>
                  <option value="baseSepolia">Base Sepolia — testnet</option>
                  <option value="base">Base Mainnet</option>
                </select>
                <ChevronDown size={16}/>
              </div>
            </div>

            <div className="primus-disclaimer">
              <LockKeyhole size={15}/>
              <p>Sign in to Binance in this same browser and open the page for this template before selecting Try. The Primus extension accesses the configured Binance response for attestation. You must connect an EVM wallet and approve an on-chain task on the selected Base network; ETH is needed for gas. No Binance API key is entered into this app.</p>
            </div>
            {primusStep && <div className="primus-progress" role="status"><span className={primusBusy ? "spinner" : "primus-progress-check"}>{primusBusy ? "" : "✓"}</span>{primusStep}</div>}
            {walletError && <div className="error-box" role="alert">{walletError}</div>}
            {primusError && <div className="error-box" role="alert">{primusError} <a href="https://chromewebstore.google.com/detail/primus-prev-pado/oeiomhmbaapihbilkfkhmlajkeegnjhe" target="_blank" rel="noreferrer">Get Primus extension</a></div>}
            {!walletConnected && <p className="primus-hint">Connect your EVM wallet first. You will need ETH for gas on the selected Base network.</p>}
            <p className="primus-hint">The result displays the configured <code>{template.dataKey}</code> field at <code>{template.jsonPath}</code> as returned by this template.</p>
          </>;
        })() : <>
          <div className="template-list-heading">
            <span className="template-eyebrow">PRIMUS DEVELOPER HUB TEMPLATES</span>
            <h2>Binance verification templates</h2>
            <p>Choose the Binance Spot data you want to verify.</p>
          </div>
          {Object.values(BINANCE_TEMPLATES).map(template => (
            <article className="binance-template-option" key={template.key}>
              <div className="binance-template-option-head">
                <img src={template.icon} alt="Binance" className="binance-option-logo" />
                <div>
                  <h3>{template.title}</h3>
                  <p>{template.description}</p>
                </div>
              </div>
              <div className="binance-template-option-meta">
                <span>Template ID</span><code>{template.templateId}</code>
                <span>Data item</span><strong>{template.dataKey}</strong>
              </div>
              <button className="secondary-btn template-open-btn" type="button" onClick={() => { setSelectedBinanceTemplateKey(template.key); setPrimusResult(null); setPrimusError(""); setPrimusStep(""); }}>
                View template <ArrowUpRight size={13}/>
              </button>
            </article>
          ))}
          <p className="primus-hint">Open a template to review its source details and run its Primus zkTLS attestation.</p>
        </>}
      </section>

      <section className="card result-card" aria-live="polite">
        {method === "wallet" ? (walletResult ? <div className="proof-result">
          <div className="result-top"><div className="result-icon"><Check size={22}/></div><div><span className="step-label">ON-CHAIN BALANCE CHECK</span><h2>{walletResult.thresholdResult === "PASS" ? "Threshold met" : "Below threshold"}</h2></div><span className={"status " + walletResult.thresholdResult.toLowerCase()}>{walletResult.thresholdResult}</span></div>
          <div className="balance-total"><span>{walletResult.asset} on {walletResult.network}</span><strong>{walletResult.balance} <small>{walletResult.asset}</small></strong></div>
          <div className="balance-lines"><div><span>Minimum</span><b>{walletResult.minimum} {walletResult.asset}</b></div><div><span>Network</span><b>{walletResult.network}</b></div><div><span>Wallet</span><b>{shortAddress(walletResult.walletAddress)}</b></div></div>
          <div className="proof-meta"><div><span>Block number</span><b>{walletResult.blockNumber}</b></div><div><span>Checked</span><b>{new Date(walletResult.checkedAt).toLocaleString()}</b></div><div><span>RPC source</span><b>{walletResult.rpcProvider}</b></div></div>
          <div className="boundary verified"><CircleHelp size={16}/><span>{walletResult.verifiesWhat} {walletResult.doesNotVerify}</span></div>
          <a className="secondary-btn" href={walletResult.explorerUrl} target="_blank" rel="noreferrer"><Link2 size={15}/> View address on block explorer <ArrowUpRight size={13}/></a>
          <button className="secondary-btn reset-btn" type="button" onClick={() => { setWalletResult(null); setWalletError(""); }}><ArrowDownToLine size={15}/> Check another address</button>
        </div> : <div className="empty-state"><div className="empty-icon"><Wallet size={25}/></div><span className="step-label">02 — WALLET RESULT</span><h2>Your wallet check will appear here</h2><p>We’ll read the selected asset balance from the chosen public EVM network at a specific block, then compare it with your minimum.</p><div className="result-skeleton"><span/><span/><span/></div><div className="boundary"><CircleHelp size={16}/><span>This is a public RPC balance lookup, not a cryptographic proof or proof that you control the address.</span></div></div>) : (primusResult ? <div className="proof-result">
          <div className="result-top"><div className="result-icon"><Check size={22}/></div><div><span className="step-label">PRIMUS ATTESTATION VERIFIED</span><h2>{primusResult.templateTitle}</h2></div><span className="status pass">VERIFIED</span></div>
          <div className={primusResult.templateKey === "pnl" ? "pnl-rate-value" : "trade-history-value"}>
            <span>{primusResult.dataKey} · attested template value</span>
            {primusResult.templateKey === "pnl" && (typeof primusResult.value === "string" || typeof primusResult.value === "number")
              ? <strong>{String(primusResult.value)}</strong>
              : <pre>{JSON.stringify(primusResult.value, null, 2)}</pre>}
          </div>
          <div className="balance-lines"><div><span>Data source</span><b>Binance Spot</b></div><div><span>JSONPath</span><b>{primusResult.jsonPath}</b></div><div><span>Wallet</span><b>{shortAddress(primusResult.address)}</b></div><div><span>Primus network</span><b>{primusResult.chain}</b></div></div>
          <div className="proof-meta">
            {primusResult.taskTxHash && <div><span>Task transaction</span><a href={primusChains[primusChain].explorer + "/tx/" + primusResult.taskTxHash} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={12}/></a></div>}
            {primusResult.reportTxHash && <div><span>Attestation transaction</span><a href={primusChains[primusChain].explorer + "/tx/" + primusResult.reportTxHash} target="_blank" rel="noreferrer">View attestation <ArrowUpRight size={12}/></a></div>}
          </div>
          <div className="boundary verified"><ShieldCheck size={16}/><span>Primus confirmed the attestation task. The app displays the configured field as returned; it does not transform or infer additional meaning from the source data.</span></div>
          <span className="primus-data-label">FULL ATTESTED TEMPLATE RESPONSE</span>
          <pre>{JSON.stringify(primusResult.data ?? primusResult.taskResult ?? {}, null, 2)}</pre>
          <button className="secondary-btn reset-btn" type="button" onClick={() => { setPrimusResult(null); setPrimusError(""); }}><ArrowDownToLine size={15}/> Try again</button>
        </div> : selectedBinanceTemplateKey ? <div className="empty-state">
          <div className="empty-icon"><img src={BINANCE_ICON} alt="Binance" /></div>
          <span className="step-label">02 — BINANCE TEMPLATE RESULT</span>
          <h2>Your attested data will appear here</h2>
          <p>Connect your wallet, sign in to Binance in this browser, then select Try to generate the Primus zkTLS attestation.</p>
          <div className="result-skeleton"><span/><span/><span/></div>
          <div className="boundary"><CircleHelp size={16}/><span>The selected template will return the value at {BINANCE_TEMPLATES[selectedBinanceTemplateKey].jsonPath}. It will be shown as returned by the source template.</span></div>
        </div> : <div className="empty-state">
          <div className="empty-icon"><img src={BINANCE_ICON} alt="Binance" /></div>
          <span className="step-label">02 — BINANCE TEMPLATE RESULT</span>
          <h2>Select a template to begin</h2>
          <p>Choose Spot Account PnL Rate or Spot Trade History. The corresponding attested result will appear here.</p>
          <div className="result-skeleton"><span/><span/><span/></div>
          <div className="boundary"><CircleHelp size={16}/><span>Each template has its own request URL, data item and JSONPath.</span></div>
        </div>)}
      </section>
    </section>
    <footer><span>Built for transparent verification.</span><span>{method === "wallet" ? "EVM JSON-RPC" : "Primus zkTLS"} <i/> {method === "wallet" ? "Ethereum · Base · BNB Chain" : "Binance Spot templates"}</span></footer>
  </main>;
}

function parseTemplateData(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function getJsonPathValue(source, jsonPath) {
  const segments = jsonPath.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let current = parseTemplateData(source);
  for (const segment of segments) {
    current = parseTemplateData(current);
    if (current === null || current === undefined || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return parseTemplateData(current);
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
