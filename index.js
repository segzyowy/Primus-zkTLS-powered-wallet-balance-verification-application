import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createBinanceBalanceProof } from "./binance.js";
import { getOnchainBalance } from "./wallet.js";

const app = express();
const port = Number(process.env.PORT || 8787);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

if (allowedOrigins.length) {
  app.use(cors({ origin: allowedOrigins }));
}
app.use(express.json({ limit: "32kb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "proof-of-balance",
    primusConfigured: Boolean(process.env.ZKTLS_APP_ID && process.env.ZKTLS_APP_SECRET)
  });
});


app.post("/api/wallet/balance", async (req, res) => {
  try {
    const result = await getOnchainBalance({
      address: req.body?.address,
      network: req.body?.network,
      asset: req.body?.asset,
      minimum: req.body?.minimum
    });
    return res.json(result);
  } catch (error) {
    const message = error?.message || "Wallet balance lookup failed. Please try again.";
    const status = /Enter a valid|Choose a supported|not supported|positive decimal|too many decimal places/i.test(message) ? 400 : 502;
    return res.status(status).json({ error: message });
  }
});

app.post("/api/verify/binance", async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const { apiKey, apiSecret, asset, minimum } = req.body || {};
    if (!process.env.ZKTLS_APP_ID || !process.env.ZKTLS_APP_SECRET) {
      return res.status(503).json({ error: "Primus is not configured. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET to the server .env file." });
    }
    if (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 256 ||
        typeof apiSecret !== "string" || apiSecret.length < 8 || apiSecret.length > 256) {
      return res.status(400).json({ error: "Enter a valid Binance read-only API key and secret." });
    }
    const cleanAsset = String(asset || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{2,20}$/.test(cleanAsset)) {
      return res.status(400).json({ error: "Enter a valid asset symbol, such as USDT or BTC." });
    }
    const cleanMinimum = String(minimum ?? "").trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(cleanMinimum) || Number(cleanMinimum) <= 0) {
      return res.status(400).json({ error: "Minimum balance must be a positive decimal amount (up to 18 decimal places)." });
    }

    const result = await createBinanceBalanceProof({
      apiKey, apiSecret, asset: cleanAsset, minimum: cleanMinimum,
      appId: process.env.ZKTLS_APP_ID,
      appSecret: process.env.ZKTLS_APP_SECRET
    });

    // Credentials are request-scoped and are never written to disk or returned.
    return res.json({ requestId, ...result });
  } catch (error) {
    // Keep request bodies, credentials, signatures and upstream payloads out of logs.
    console.error(`[${requestId}] verification failed`);
    const message = error?.publicMessage || "Verification failed. Check your API key permissions, Primus setup and try again.";
    return res.status(502).json({ requestId, error: message });
  }
});

app.use(express.static("dist"));
app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  const status = error?.type === "entity.too.large" ? 413 : 400;
  res.status(status).json({ error: status === 413 ? "Request is too large." : "Invalid request." });
});

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  app.listen(port, () => console.log(`Proof of Balance API listening on http://localhost:${port}`));
}

export default app;
