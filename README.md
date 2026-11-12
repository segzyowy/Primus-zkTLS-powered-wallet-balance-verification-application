# Proof of Balance

A small web app with two separate checks:

1. **Binance 7-Day Spot Account PnL Rate** — a Primus Network zkTLS attestation using a fixed Developer Hub template.
2. **Public EVM wallet balance** — a read-only RPC lookup for ETH and supported ERC-20 assets.

## Binance PnL template

The Binance screen is preconfigured with the supplied Primus template:

| Field | Value |
| --- | --- |
| Title | 7-Day Spot Account PnL Rate |
| Description | Verify the user’s last 7-day spot account PnL rate. |
| Template ID | `67ed246d-ff00-47d5-9026-5ff09cbdd65b` |
| Data source URL | https://www.binance.com/en/my/pnl/spot_account/ |
| Request URL | https://www.binance.com/bapi/composite/v1/private/bigdata/finance/spot-statistics |
| Data item | `spotPnlRate` |
| JSONPath | `$.data.cumulativeCurrWeek.spotPnlRate` |

The app displays the attested `spotPnlRate` value as returned by the template. It does not add a percentage sign, convert the value, or compare it against an invented threshold. Note that the configured JSONPath includes `cumulativeCurrWeek`; the app preserves that source field and does not silently reinterpret its reporting period.

### Try the Binance template

1. Open Binance and sign in in the **same browser**. Visit the [Spot Account PnL page](https://www.binance.com/en/my/pnl/spot_account/).
2. Install and enable the Primus browser extension (version 0.3.44 or later).
3. Open the app’s Binance PnL tab and connect an EVM wallet.
4. Select Base Sepolia for testing or Base Mainnet for production.
5. Select **Try**. The Primus Network SDK submits a task on-chain, runs the browser-extension attestation, and waits for the result to be confirmed.

The selected wallet needs ETH on the selected Base network to pay task-submission gas. The template does not transfer Binance assets and the app does not ask for a Binance API key or secret in this flow.

Official links:
- [Primus Developer Hub](https://dev.primuslabs.xyz/)
- [Primus Network SDK demo](https://github.com/primus-labs/zktls-demo/tree/main/network-sdk-example)
- [Primus DApp SDK guide](https://github.com/primus-labs/skills/tree/main/primus-network-js-sdk-dapp)
- [Primus browser extension](https://chromewebstore.google.com/detail/primus-prev-pado/oeiomhmbaapihbilkfkhmlajkeegnjhe)

## Public wallet balance lookup

The Wallet balance tab supports these network and asset combinations:

| Network | Native asset | ERC-20 assets |
| --- | --- | --- |
| Ethereum Mainnet | ETH | USDC, USDT |
| Base Mainnet | ETH | USDC |
| BNB Smart Chain | BNB | USDT (Binance-Peg) |

The API uses public JSON-RPC endpoints and reads the native balance with `eth_getBalance` or token balance with ERC-20 `balanceOf`. It records a block number and queries the balance at that block, then compares the exact integer amount with the requested minimum.

This is a **public RPC balance lookup**, not a Primus attestation or cryptographic proof. It does not prove that the person submitting the address controls that address; anyone can look up a public address. The result also depends on the configured RPC endpoint.

### Wallet API

`POST /api/wallet/balance`

Example request:

```json
{
  "address": "0x0000000000000000000000000000000000000001",
  "network": "ethereum",
  "asset": "ETH",
  "minimum": "0.1"
}
```

## Requirements

- Node.js 20 or newer and npm
- MetaMask or another EVM browser wallet
- Primus browser extension version 0.3.44 or later
- A Binance account signed in to the same browser for the Binance PnL template
- ETH on Base Sepolia (test) or Base Mainnet (production) for the Primus task transaction

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

For a production build:

```bash
npm test
npm run build
```

The Express development server serves the API routes; the Cloudflare Worker serves the built Vite assets and handles `/api/*`.

## Proof boundaries and privacy

- The Binance PnL value is taken from the configured Primus template response and shown exactly as returned.
- The template’s field path is `$.data.cumulativeCurrWeek.spotPnlRate`; the app does not infer a separate rolling-period formula.
- The on-chain task submission is a wallet transaction on the selected Base network. It does not transfer Binance funds.
- The wallet balance panel is a public RPC lookup and is separate from the Binance PnL zkTLS attestation.
- Never enter a wallet seed phrase or private key into this application.

A legacy server-side Binance account-balance API route remains in the Worker for compatibility, but the current Binance PnL interface does not call it. It is not required for the template flow.

## Deploy to Cloudflare Workers

This repository includes a Workers entry point (`worker.js`) and a Wrangler configuration (`wrangler.jsonc`). The Worker serves the Vite `dist/` assets and handles `/api/*` requests.

1. Connect the GitHub repository to Workers Builds.
2. Use production branch `main` and root directory `/`.
3. Set the build command to `npm run build` and the deploy command to `npx wrangler deploy`.
4. Keep Cloudflare Access protection disabled for the public application unless you intentionally want a private app.
5. Test `https://YOUR-WORKER.workers.dev/api/health`.

The repository pins `npm@10.9.2`. GitHub Actions regenerates and commits the lockfile when needed, then tests with a clean `npm ci`, runs the test suite, builds the Vite app and performs a Wrangler dry-run.
