import { useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, CircleHelp, Eye, EyeOff, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";

const initial = { apiKey: "", apiSecret: "", asset: "USDT", minimum: "100" };

export default function App() {
  const [form, setForm] = useState(initial);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function update(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/verify/binance", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
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

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Proof of Balance home"><span className="brand-mark"><Wallet size={19}/></span><span>proof<span className="brand-dot">.</span></span></a>
      <a className="top-link" href="https://github.com/segzyowy/proof-of-balance" target="_blank" rel="noreferrer">Open source <ArrowUpRight size={15}/></a>
    </header>

    <section className="hero" id="top">
      <div className="eyebrow"><span className="pulse"/> PRIVATE DATA, VERIFIABLE PROOF</div>
      <h1>Your balance.<br/><span>Your proof.</span></h1>
      <p className="intro">Verify a Binance Spot balance with a Primus zkTLS attestation. Choose an asset and threshold, then review exactly what the proof confirms.</p>
      <div className="trust-row"><span><ShieldCheck size={16}/> Read-only access</span><i/><span>One asset at a time</span><i/><span>Point-in-time snapshot</span></div>
    </section>

    <section className="workspace">
      <form className="card form-card" onSubmit={submit}>
        <div className="card-head"><div className="step">01</div><div><h2>Set up your proof</h2><p>Use a dedicated Binance key with read permission only.</p></div></div>
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
        <button className="primary-btn" disabled={busy}>{busy ? <><span className="spinner"/> Generating proof…</> : <>Verify balance <ArrowUpRight size={17}/></>}</button>
        <p className="key-tip">Never enable trading or withdrawals on this API key. <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noreferrer">Manage API keys <ArrowUpRight size={12}/></a></p>
      </form>

      <section className="card result-card" aria-live="polite">
        {!result ? <div className="empty-state"><div className="empty-icon"><ShieldCheck size={25}/></div><span className="step-label">02 — RESULT</span><h2>Your proof will appear here</h2><p>We’ll verify the authenticated Binance response with Primus, then compare free + locked Spot balance against your threshold.</p><div className="result-skeleton"><span/><span/><span/></div><div className="boundary"><CircleHelp size={16}/><span>Exact balance values are visible in this MVP. This is not a threshold-only zero-knowledge proof.</span></div></div> : <div className="proof-result">
          <div className="result-top"><div className="result-icon"><Check size={22}/></div><div><span className="step-label">PRIMUS ATTESTATION VERIFIED</span><h2>{result.thresholdResult === "PASS" ? "Threshold met" : "Below threshold"}</h2></div><span className={`status ${result.thresholdResult.toLowerCase()}`}>{result.thresholdResult}</span></div>
          <div className="balance-total"><span>{result.asset} Spot balance</span><strong>{formatAmount(result.free, result.locked)} <small>{result.asset}</small></strong></div>
          <div className="balance-lines"><div><span>Available</span><b>{result.free} {result.asset}</b></div><div><span>Locked</span><b>{result.locked} {result.asset}</b></div><div><span>Minimum</span><b>{result.minimum} {result.asset}</b></div></div>
          <div className="proof-meta"><div><span>Source</span><b>Binance Spot account</b></div><div><span>Attested</span><b>{new Date(result.attestedAt).toLocaleString()}</b></div><div><span>Attestors</span><b>{result.attestorCount || "Verified locally"}</b></div></div>
          <div className="boundary verified"><ShieldCheck size={16}/><span>{result.verifiesWhat} {result.doesNotVerify}</span></div>
          <button className="secondary-btn" onClick={() => { setResult(null); setError(""); }}><ArrowDownToLine size={15}/> Start another check</button>
        </div>}
      </section>
    </section>
    <footer><span>Built for transparent verification.</span><span>Primus zkTLS <i/> Binance Spot</span></footer>
  </main>;
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
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}
