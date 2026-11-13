import { useEffect, useRef, useState } from "react";
import { PrimusZKTLS } from "@primuslabs/zktls-js-sdk";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, CircleHelp, LockKeyhole, ShieldCheck } from "lucide-react";

const BINANCE_ICON = "https://storage.googleapis.com/primuslabs-online/developer-center/website-icon/binance.png";
// Primus' enterprise SDK requires an Ethereum-format recipient identifier.
// This neutral address avoids connecting or associating a user's wallet.
const PRIMUS_RECIPIENT = "0x0000000000000000000000000000000000000000";

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
    title: "Spot Trade History",
    description: "Verify the user’s 30-day spot trade history on Binance.",
    templateId: "c25c9f6a-b816-4a67-86ab-7292eff209a3",
    sourceUrl: "https://www.binance.com/en/my/orders/exchange/usertrade",
    requestUrl: "https://www.binance.com/bapi/capital/v1/private/streamer/trade/get-user-trades",
    dataKey: "data",
    jsonPath: "$.data",
    sourceLabel: "Open Binance Spot Trade History"
  }
};

export default function App() {
  const primusRef = useRef(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState("");
  const [selectedBinanceTemplateKey, setSelectedBinanceTemplateKey] = useState(null);
  const [primusBusy, setPrimusBusy] = useState(false);
  const [primusStep, setPrimusStep] = useState("");
  const [primusResult, setPrimusResult] = useState(null);
  const [primusError, setPrimusError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function initialisePrimus() {
      try {
        const response = await fetch("/api/primus/config", { cache: "no-store" });
        const config = await response.json();
        if (!response.ok || !config.appId) {
          throw new Error(config.error || "Primus is not configured. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET as server-side environment variables for this deployment.");
        }
        const primus = new PrimusZKTLS();
        await primus.init(config.appId);
        if (!cancelled) {
          primusRef.current = primus;
          setSdkReady(true);
          setSdkError("");
        }
      } catch (error) {
        if (!cancelled) {
          setSdkError(error?.message || "Primus could not be initialised.");
          setSdkReady(false);
        }
      }
    }
    initialisePrimus();
    return () => {
      cancelled = true;
      primusRef.current = null;
    };
  }, []);

  async function startPrimusAttestation() {
    setPrimusError("");
    setPrimusResult(null);
    const selectedTemplate = selectedBinanceTemplateKey ? BINANCE_TEMPLATES[selectedBinanceTemplateKey] : null;
    if (!selectedTemplate) {
      setPrimusError("Choose a Binance template first.");
      return;
    }
    const primus = primusRef.current;
    if (!primus || !sdkReady) {
      setPrimusError(sdkError || "Primus is still initialising. Refresh the page and try again.");
      return;
    }

    setPrimusBusy(true);
    setPrimusStep("Preparing the Primus request; the extension will open Binance");
    try {
      const request = primus.generateRequestParams(selectedTemplate.templateId, PRIMUS_RECIPIENT);
      request.setAttMode({ algorithmType: "proxytls" });
      const signParams = request.toJsonString();

      setPrimusStep("Requesting a secure signature from the app server");
      const signResponse = await fetch("/api/primus/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signParams }),
        cache: "no-store"
      });
      const signResponseText = await signResponse.text();
      let signData;
      try {
        signData = JSON.parse(signResponseText);
      } catch {
        const contentType = signResponse.headers.get("content-type") || "unknown content type";
        throw new Error(`Primus signing endpoint returned a non-JSON response (HTTP ${signResponse.status}, ${contentType}). Check the Netlify function deployment and logs.`);
      }
      if (!signResponse.ok) {
        const code = signData.code ? ` [${signData.code}]` : "";
        const responseSummary = JSON.stringify(signData || {}).slice(0, 500);
        const fallback = responseSummary && responseSummary !== "{}"
          ? `Netlify returned HTTP ${signResponse.status}. Response: ${responseSummary}`
          : `Netlify returned HTTP ${signResponse.status} with no diagnostic body. Check the production function deployment and invocation logs.`;
        const detail = signData.error || signData.message || fallback;
        throw new Error(`Primus signing failed${code}: ${detail}`);
      }
      if (typeof signData.signResult !== "string" || !signData.signResult.trim()) {
        const fields = Object.keys(signData || {}).join(", ") || "none";
        throw new Error(`Netlify signing function returned HTTP ${signResponse.status} without a signature. Response fields: ${fields}. Check the Netlify function logs and confirm the production environment variables are available to Functions.`);
      }

      setPrimusStep("Running zkTLS verification in the Primus extension");
      const attestation = await primus.startAttestation(signData.signResult);
      if (!attestation) throw new Error("Primus did not return an attestation result.");

      setPrimusStep("Verifying the Primus attestation signature");
      const verified = await primus.verifyAttestation(attestation);
      if (verified !== true) {
        throw new Error("The Primus attestation did not pass local signature verification. No verified result was issued.");
      }

      const verifiedData = parseTemplateData(attestation.data);
      const templateValue = findNamedValue(verifiedData, selectedTemplate.dataKey);
      if (templateValue === undefined || templateValue === null) {
        throw new Error(`The attestation signature is valid, but the configured data item "${selectedTemplate.dataKey}" was not found in the returned template data.`);
      }

      setPrimusResult({
        templateKey: selectedTemplate.key,
        templateTitle: selectedTemplate.title,
        dataKey: selectedTemplate.dataKey,
        jsonPath: selectedTemplate.jsonPath,
        value: templateValue,
        data: verifiedData,
        recipient: PRIMUS_RECIPIENT,
        attestedAt: attestation.timestamp || null,
        signatureVerified: true
      });
      setPrimusStep("Primus attestation verified");
    } catch (error) {
      setPrimusError(error?.data?.message || error?.reason || error?.message || "Primus attestation could not be completed.");
      setPrimusStep("");
    } finally {
      setPrimusBusy(false);
    }
  }

  const selectedTemplate = selectedBinanceTemplateKey ? BINANCE_TEMPLATES[selectedBinanceTemplateKey] : null;

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Proof of Balance home"><span className="brand-mark"><ShieldCheck size={19}/></span><span>proof<span className="brand-dot">.</span></span></a>
      <a className="top-link" href="https://github.com/segzyowy/proof-of-balance" target="_blank" rel="noreferrer">Open source <ArrowUpRight size={15}/></a>
    </header>

    <section className="hero" id="top">
      <div className="eyebrow"><span className="pulse"/> BINANCE · PRIMUS ZKTLS</div>
      <h1>Your account.<br/><span>Your proof.</span></h1>
      <p className="intro">Verify your Binance Spot account PnL rate or trade history using Primus zkTLS, without connecting a crypto wallet or paying blockchain gas.</p>
      <div className="trust-row"><span><ShieldCheck size={16}/> Primus signature verification</span><i/><span>No wallet connection</span><i/><span>No on-chain gas</span></div>
    </section>

    <section className="workspace">
      <section className="card form-card binance-pnl-card">
        {selectedTemplate ? <>
          <button className="template-back-btn" type="button" onClick={() => { setSelectedBinanceTemplateKey(null); setPrimusResult(null); setPrimusError(""); setPrimusStep(""); }}>
            <ArrowLeft size={15}/> Back
          </button>
          <div className="binance-template-heading">
            <img src={selectedTemplate.icon} alt="Binance" className="binance-logo" />
            <div>
              <span className="template-eyebrow">BINANCE · PRIMUS ZKTLS</span>
              <h2>{selectedTemplate.title}</h2>
              <p>{selectedTemplate.description}</p>
            </div>
          </div>

          <div className="template-try-row">
            <span className="template-status"><ShieldCheck size={14}/> {sdkReady ? "Primus extension connected" : "Initialising Primus…"}</span>
            <button className="primus-action-btn template-try-btn" type="button" onClick={startPrimusAttestation} disabled={primusBusy || !sdkReady}>
              {primusBusy
                ? <><span className="spinner"/> {primusStep || "Verifying…"}</>
                : <>{selectedTemplate.key === "trades" ? "Verify trading history" : "Verify PnL rate"} <ArrowUpRight size={15}/></>}
            </button>
          </div>

          <div className="template-details">
            <h3>Template details</h3>
            <div className="template-detail-row"><span>Template ID</span><code>{selectedTemplate.templateId}</code></div>
            <div className="template-detail-row"><span>Data source URL</span><a href={selectedTemplate.sourceUrl} target="_blank" rel="noreferrer">{selectedTemplate.sourceLabel} <ArrowUpRight size={12}/></a></div>
            <div className="template-detail-row template-url-row"><span>Request URL</span><a href={selectedTemplate.requestUrl} target="_blank" rel="noreferrer">{selectedTemplate.requestUrl} <ArrowUpRight size={12}/></a></div>
            <div className="template-data-item">
              <span>Data items (jsonPath)</span>
              <strong>{selectedTemplate.dataKey}</strong>
              <code>{selectedTemplate.jsonPath}</code>
            </div>
          </div>

          <div className="primus-disclaimer">
            <LockKeyhole size={15}/>
            <p>Select {selectedTemplate.key === "trades" ? "Verify trading history" : "Verify PnL rate"} to hand the request to the Primus extension. The extension opens Binance in its own data-source tab, guides the capture, and returns the attestation here. Sign in only on the genuine Binance page if prompted. This app never asks for your Binance password, wallet access, wallet signatures, blockchain transactions or gas.</p>
          </div>
          {primusStep && <div className="primus-progress" role="status"><span className={primusBusy ? "spinner" : "primus-progress-check"}>{primusBusy ? "" : "✓"}</span>{primusStep}</div>}
          {sdkError && <div className="error-box" role="alert">{sdkError}</div>}
          {primusError && <div className="error-box" role="alert">{primusError} <a href="https://chromewebstore.google.com/detail/primus-prev-pado/oeiomhmbaapihbilkfkhmlajkeegnjhe" target="_blank" rel="noreferrer">Get Primus extension</a></div>}
          <p className="primus-hint">The Primus browser extension is required. <a href="https://chromewebstore.google.com/detail/primus-prev-pado/oeiomhmbaapihbilkfkhmlajkeegnjhe" target="_blank" rel="noreferrer">Install extension</a>.</p>
          <p className="primus-hint">The app displays the configured <code>{selectedTemplate.dataKey}</code> field at <code>{selectedTemplate.jsonPath}</code> exactly as returned. It does not infer or convert the source value. This is the response returned by Binance for the signed-in account session.</p>
        </> : <>
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
          <p className="primus-hint">Open a template to review its details and start its Primus zkTLS attestation.</p>
          {!sdkReady && <p className="primus-hint">{sdkError || "Connecting securely to Primus…"}</p>}
        </>}
      </section>

      <section className="card result-card" aria-live="polite">
        {primusResult ? <div className="proof-result">
          <div className="result-top"><div className="result-icon"><Check size={22}/></div><div><span className="step-label">PRIMUS SIGNATURE VERIFIED</span><h2>{primusResult.templateTitle}</h2></div><span className="status pass">VERIFIED</span></div>
          <div className={primusResult.templateKey === "pnl" ? "pnl-rate-value" : "trade-history-value"}>
            <span>{primusResult.dataKey} · attested template value</span>
            {primusResult.templateKey === "pnl" && (typeof primusResult.value === "string" || typeof primusResult.value === "number")
              ? <strong>{String(primusResult.value)}</strong>
              : <pre>{JSON.stringify(primusResult.value, null, 2)}</pre>}
          </div>
          <div className="balance-lines"><div><span>Data source</span><b>Binance Spot</b></div><div><span>JSONPath</span><b>{primusResult.jsonPath}</b></div><div><span>Account access</span><b>Authenticated Binance browser session</b></div><div><span>Verification</span><b>Primus signature verified</b></div></div>
          {primusResult.attestedAt && <div className="proof-meta"><div><span>Attestation timestamp</span><b>{String(primusResult.attestedAt)}</b></div></div>}
          <div className="boundary verified"><ShieldCheck size={16}/><span>The Primus signature passed local verification. This verifies the configured response obtained from the Binance browser session; it is not a legal identity check or an on-chain transaction.</span></div>
          <span className="primus-data-label">FULL ATTESTED TEMPLATE RESPONSE</span>
          <pre>{JSON.stringify(primusResult.data ?? {}, null, 2)}</pre>
          <button className="secondary-btn reset-btn" type="button" onClick={() => { setPrimusResult(null); setPrimusError(""); }}><ArrowDownToLine size={15}/> {primusResult.templateKey === "trades" ? "Verify again" : "Run verification again"}</button>
        </div> : selectedTemplate ? <div className="empty-state">
          <div className="empty-icon"><img src={BINANCE_ICON} alt="Binance" /></div>
          <span className="step-label">02 — BINANCE TEMPLATE RESULT</span>
          <h2>Your attested data will appear here</h2>
          <p>Select {selectedTemplate.key === "trades" ? "Verify trading history" : "Verify PnL rate"}. The Primus extension opens Binance in its own data-source tab and returns the attested result here. If sign-in is required, complete it on the Binance tab.</p>
          <div className="result-skeleton"><span/><span/><span/></div>
          <div className="boundary"><CircleHelp size={16}/><span>The selected template returns the configured field at {selectedTemplate.jsonPath}. The app displays the attested value after local signature verification.</span></div>
        </div> : <div className="empty-state">
          <div className="empty-icon"><img src={BINANCE_ICON} alt="Binance" /></div>
          <span className="step-label">02 — BINANCE TEMPLATE RESULT</span>
          <h2>Select a template to begin</h2>
          <p>Choose Spot Account PnL Rate or Spot Trade History. The verified result will appear here.</p>
          <div className="result-skeleton"><span/><span/><span/></div>
          <div className="boundary"><CircleHelp size={16}/><span>No wallet is connected or required. Each template uses its own request URL and data item.</span></div>
        </div>}
      </section>
    </section>
    <footer><span>Built for transparent verification.</span><span>Primus enterprise zkTLS <i/> Binance Spot templates</span></footer>
  </main>;
}

function parseTemplateData(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function findNamedValue(value, key) {
  value = parseTemplateData(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNamedValue(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
    for (const nested of Object.values(value)) {
      const found = findNamedValue(nested, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
