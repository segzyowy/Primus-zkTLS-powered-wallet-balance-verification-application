import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { signPrimusRequest } from "./primus-signing.js";

const app = express();
const port = Number(process.env.PORT || 8787);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(value => value.trim()).filter(Boolean);

if (allowedOrigins.length) {
  app.use(cors({ origin: allowedOrigins }));
}
app.use(express.json({ limit: "24kb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "proof-of-balance",
    primusConfigured: Boolean(process.env.ZKTLS_APP_ID && process.env.ZKTLS_APP_SECRET),
    walletIntegration: false
  });
});

app.get("/api/primus/config", (_req, res) => {
  if (!process.env.ZKTLS_APP_ID || !process.env.ZKTLS_APP_SECRET) {
    return res.status(503).json({ error: "Primus is not configured. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET to the server .env file." });
  }
  // The App ID is public; the App Secret is never returned to the browser.
  return res.json({ appId: process.env.ZKTLS_APP_ID });
});

app.post("/api/primus/sign", async (req, res) => {
  if (!process.env.ZKTLS_APP_ID || !process.env.ZKTLS_APP_SECRET) {
    return res.status(503).json({ error: "Primus is not configured. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET to the server .env file." });
  }

  try {
    const signResult = await signPrimusRequest({
      signParams: req.body?.signParams,
      appId: process.env.ZKTLS_APP_ID,
      appSecret: process.env.ZKTLS_APP_SECRET
    });
    return res.json({ signResult });
  } catch (error) {
    // Never log request data, signatures, or credentials.
    const message = error?.message || "Primus could not sign the attestation request.";
    const status = /invalid|match|enabled|neutral recipient|expired|unsupported/i.test(message) ? 400 : 502;
    console.error("[primus-sign] request signing failed");
    return res.status(status).json({ error: message });
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
