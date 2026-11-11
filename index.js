import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { createBinanceBalanceProof } from "./binance.js";

const app = express();
const port = Number(process.env.PORT || 8787);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed"));
  }
}));
app.use(express.json({ limit: "32kb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "proof-of-balance",
    primusConfigured: Boolean(process.env.ZKTLS_APP_ID && process.env.ZKTLS_APP_SECRET)
  });
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
    // Do not log request bodies, API credentials, signed URLs or full upstream payloads.
    console.error(`[${requestId}] verification failed:`, error?.message || "Unknown error");
    const message = error?.publicMessage || "Verification failed. Check your API key permissions, Primus setup and try again.";
    return res.status(502).json({ requestId, error: message });
  }
});

app.listen(port, () => {
  console.log(`Proof of Balance API listening on http://localhost:${port}`);
});
