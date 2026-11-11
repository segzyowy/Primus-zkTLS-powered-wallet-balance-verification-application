# Proof of Balance

A small web app that creates a Primus zkTLS attestation for one Binance Spot asset balance, locally checks the returned Primus signature, and compares the attested `free + locked` amount with a minimum threshold.

## What this app verifies

- Binance Spot `GET /api/v3/account` response fields for one selected asset: `asset`, `free`, and `locked`.
- The Primus attestation signature using the SDK's local verifier.
- The threshold comparison using decimal-safe integer arithmetic.

This is a **partial, point-in-time attestation**, not a threshold-only zero-knowledge proof. The exact balance is included in the attested data and shown in the result. The app does not cover Earn, Margin, Futures, subaccounts, or later changes to the balance. The local SDK signature check is not the same as verifying the attestation against a particular on-chain contract.

The app makes a direct Binance request to locate the selected asset's array index, then makes a second signed request through Primus. The attested response is authoritative for the displayed balance; the direct request is used only to determine the JSONPath. If the balance list changes between requests, the requested asset check prevents another row from being accepted.

## Requirements

- Node.js 20 or newer
- npm
- Primus Developer Hub app ID and app secret
- A dedicated Binance API key with read-only/account-reading permission

Create Primus app credentials at <https://dev.primuslabs.xyz/>.

## Run locally

```bash
npm install
```

Copy `.env.example` to `.env` and set the server-side Primus credentials:

```env
ZKTLS_APP_ID=your_primus_app_id
ZKTLS_APP_SECRET=your_primus_app_secret
PORT=8787
```

Start the frontend and API together:

```bash
npm run dev
```

Open <http://localhost:5173>.

For a production build and server:

```bash
npm run build
npm start
```

The Express server serves `dist/` and the `/api` endpoints from the same origin.

## Credential handling

- The Primus app ID and app secret stay in the backend `.env` file. The browser never receives them.
- The user enters a Binance API key and secret in the browser. They are sent to the backend for the current request and are not written to disk or logged. The form clears them after the request completes.
- The backend response deliberately omits the raw Primus attestation because its embedded signed request contains the Binance API key header and signed URL. The response returns only the verification summary and selected balance fields.
- The server operator can access Binance credentials while processing a request. Run the app only on a server you control and trust, and use HTTPS for remote deployments.
- Never enable trading, withdrawals, transfers, or permissions the proof does not need. Enable Binance IP restrictions where possible.
- `.env` and `.env.*` are ignored by Git; `.env.example` contains blank placeholders only.

If hosting the frontend on a separate origin, set `ALLOWED_ORIGINS` to a comma-separated list of exact allowed origins. Keep this empty for same-origin use.

## API

### `GET /api/health`

Returns app health and whether Primus credentials are configured. It never returns credentials.

### `POST /api/verify/binance`

Request body:

```json
{
  "apiKey": "BINANCE_READ_ONLY_KEY",
  "apiSecret": "BINANCE_READ_ONLY_SECRET",
  "asset": "USDT",
  "minimum": "100"
}
```

The response includes the selected fields, PASS/FAIL comparison, attestation time, local verification status, and the proof boundary. It does not return the raw attestation or signed Binance request.

## Development checks

```bash
npm test
npm run build
```

## References

- [Primus zkTLS Core SDK](https://github.com/primus-labs/zktls-core-sdk)
- [Primus zkTLS integration guide](https://github.com/primus-labs/skills/tree/main/primus-zktls-core-sdk)
- [Primus Binance Spot asset balance example](https://github.com/primus-labs/skills/blob/main/binance-verifiable-skills/scripts/demo-binance-spot-asset-balance.mjs)
- [Binance Spot account endpoint](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints)


## Deploy to Cloudflare Workers

This repository includes a Workers entry point (worker.js) and a Wrangler configuration (wrangler.jsonc). The Worker serves the Vite dist/ assets and handles /api/* requests.

1. In Cloudflare, open Workers & Pages and create a Worker connected to this GitHub repository.
2. Use production branch main and root directory /.
3. Set the Workers Build command to npm run build. Keep the deploy command at its default, npx wrangler deploy.
4. Keep Protect with Cloudflare Access disabled for the public application. Preview builds are optional; enabling them is useful for testing non-production branches.
5. After the first deployment, open the Worker Settings > Variables and Secrets and add ZKTLS_APP_ID and ZKTLS_APP_SECRET as encrypted secrets. Do not add these as plain text build variables, and never commit them to GitHub.
6. Test https://YOUR-WORKER.workers.dev/api/health. It should return ok: true and primusConfigured: true after both secrets are saved.

The Cloudflare Worker path is an initial deployment adapter. The Primus Core SDK uses a WASM algorithm backend plus Node-oriented WebSocket/native-addon code; successful static build and Worker deployment do not by themselves prove that live Primus attestation works on Workers. Run a real test with a dedicated Binance read-only API key before treating the verification flow as operational. The exact attested balance fields are disclosed in this MVP; it is not a threshold-only zero-knowledge proof.
