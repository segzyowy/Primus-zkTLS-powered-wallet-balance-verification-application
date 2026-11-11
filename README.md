# Proof of Balance

A community prototype that creates a Primus zkTLS attestation for one selected Binance Spot asset balance and compares the attested `free + locked` amount with a user-selected threshold.

## Current scope

- Binance Spot account balance proof using `GET https://api.binance.com/api/v3/account`.
- Primus `@primuslabs/zktls-core-sdk` attestation generation.
- Local Primus signature verification before returning a result.
- Asset-specific response extraction (`asset`, `free`, `locked`).
- PASS/FAIL threshold calculation using decimal-safe integer arithmetic.
- React/Vite dashboard and Express API.
- User-provided Binance credentials are request-scoped; the app does not save them or log request bodies.

**OKX:** The current Primus `onchainos-verifiable-skills` wallet balance examples concern on-chain wallet portfolio endpoints, not a centralized OKX exchange-account balance endpoint. This project therefore does not pretend that CEX OKX account balance verification is implemented. Add an OKX exchange connector only after an official supported endpoint and matching Primus proof flow are validated.

## Important proof boundary

This MVP attests the selected Binance response fields `asset`, `free`, and `locked`. It then compares `free + locked` against the requested threshold after local signature verification.

The returned attestation contains those balance fields. Therefore, this version does **not** cryptographically hide the exact balance or prove a zero-knowledge threshold-only statement. The result is a locally verified signed attestation plus an application-level threshold comparison. Do not market it as a threshold-only ZK proof.

The proof is a point-in-time Spot account response. It does not include Earn, Margin, Futures, subaccounts, or other account products. It does not guarantee that the balance remains unchanged after the attested timestamp.

## Requirements

- Node.js 20 or newer recommended
- npm
- Primus Developer Hub app ID and app secret
- Binance API key with **read-only** permission; trading and withdrawal permissions must remain disabled

Create Primus credentials at https://dev.primuslabs.xyz/.

## Run locally

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set:

```env
ZKTLS_APP_ID=your_primus_app_id
ZKTLS_APP_SECRET=your_primus_app_secret
PORT=8787
```

Start the app:

```bash
npm run dev
```

Open http://localhost:5173.

## Binance API key safety

1. Create a dedicated API key in Binance API Management.
2. Enable read-only/account reading permission only.
3. Disable trading, withdrawals, transfers and all permissions not needed.
4. Configure IP restrictions where possible.
5. Never paste your API secret into GitHub, a source file, a screenshot or a public issue.
6. The browser sends the key and secret to the backend for the current verification request. The server does not persist them, but the server operator can technically access them while processing. Run this app on a server you control and trust. Use HTTPS for any remote deployment.
7. The app's `.env` contains the Primus app secret and must never be committed.

## Production build

```bash
npm run build
npm start
```

The Express server currently exposes the API. For production, configure a reverse proxy to serve the `dist/` folder and forward `/api` to the Express process, or deploy the Vite frontend and API behind the same HTTPS origin. Configure `ALLOWED_ORIGINS` if using a separate frontend origin.

## API

### `GET /api/health`

Reports app health and whether Primus credentials are configured. Does not expose credentials.

### `POST /api/verify/binance`

JSON body:

```json
{
  "apiKey": "BINANCE_READ_ONLY_KEY",
  "apiSecret": "BINANCE_READ_ONLY_SECRET",
  "asset": "USDT",
  "minimum": "100"
}
```

Returns the threshold result, extracted fields, proof boundary, and Primus attestation when successful.

## GitHub upload

1. Download and extract the ZIP.
2. Create a new empty GitHub repository.
3. Open a terminal in the extracted `proof-of-balance` folder.
4. Run:

```bash
git init
git add .
git commit -m "Build Proof of Balance MVP"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/proof-of-balance.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username. Do not add `.env` or credentials to the repository.

## Official references

- Primus Skills repository: https://github.com/primus-labs/skills
- Binance verifiable skills: https://github.com/primus-labs/skills/tree/main/binance-verifiable-skills
- Primus zkTLS Core SDK guide: https://github.com/primus-labs/skills/tree/main/primus-zktls-core-sdk
- Primus documentation: https://docs.primuslabs.xyz/
- Primus Developer Hub: https://dev.primuslabs.xyz/
- Binance API documentation: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints

## Prototype status

This is a source-code MVP scaffold. It has not been run against live Binance credentials or a live Primus project from this environment. Install dependencies, configure your own credentials, and test with a dedicated read-only account before public deployment.
