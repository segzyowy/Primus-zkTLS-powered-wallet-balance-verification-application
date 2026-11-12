# Proof of Balance

A small web app with two areas:

1. **Binance templates** — Primus Network zkTLS attestations for Binance Spot PnL and Spot trade-history data.
2. **Wallet balance** — a read-only public RPC lookup for ETH and supported ERC-20 assets.

## Binance templates

The Binance tab contains a template chooser. Open either template to review its details, connect an EVM wallet, choose Base Sepolia or Base Mainnet, and select **Try**. Each detail page has a **Back** control to return to the template chooser.

### 7-Day Spot Account PnL Rate

| Field | Value |
| --- | --- |
| Description | Verify the user’s last 7-day spot account PnL rate. |
| Template ID | `67ed246d-ff00-47d5-9026-5ff09cbdd65b` |
| Data source URL | https://www.binance.com/en/my/pnl/spot_account/ |
| Request URL | https://www.binance.com/bapi/composite/v1/private/bigdata/finance/spot-statistics |
| Data item | `spotPnlRate` |
| JSONPath | `$.data.cumulativeCurrWeek.spotPnlRate` |

The app displays the attested `spotPnlRate` value as returned. It does not add a percentage sign, convert the value or compare it against an invented threshold. The configured JSONPath includes `cumulativeCurrWeek`; the app does not reinterpret its reporting period.

### 7-Day Spot Trade History

| Field | Value |
| --- | --- |
| Description | Verify the user’s 30-day spot trade history on Binance. |
| Template ID | `c25c9f6a-b816-4a67-86ab-7292eff209a3` |
| Data source URL | https://www.binance.com/en/my/orders/exchange/usertrade |
| Request URL | https://www.binance.com/bapi/capital/v1/private/streamer/trade/get-user-trades |
| Data item | `data` |
| JSONPath | `$.data` |

The app displays the returned `data` value as JSON. The supplied title says 7-Day while the supplied description says 30-day; both are preserved as provided. The app does not infer or alter the covered time range.

### Using a Binance template

1. Open Binance and sign in in the **same browser**. Visit the source page for the chosen template.
2. Install and enable the Primus browser extension (version 0.3.44 or later).
3. In the Binance tab, select the template and connect an EVM wallet.
4. Choose Base Sepolia for testing or Base Mainnet for production.
5. Select **Try**. The Primus Network SDK submits a task on-chain, runs the browser-extension attestation, then waits for the result to be confirmed.
6. Use **Back** to return to the template chooser and open the other template.

The selected wallet needs ETH on the selected Base network for task-submission gas. The flow does not transfer Binance assets and does not ask for a Binance API key or secret.

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
- A Binance account signed in to the same browser
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

- The app displays the data values selected by the configured Primus templates; it does not invent units, convert figures or infer a time range.
- The Spot Account PnL JSONPath is `$.data.cumulativeCurrWeek.spotPnlRate`.
- The Spot Trade History JSONPath is `$.data`.
- The on-chain task submission is a wallet transaction on the selected Base network. It does not transfer Binance funds.
- The wallet balance panel is a public RPC lookup and is separate from the Binance zkTLS attestations.
- Never enter a wallet seed phrase or private key into this application.

A legacy server-side Binance account-balance API route remains in the Worker for compatibility, but the current Binance template interface does not call it.

## Deploy to Cloudflare Workers

This repository includes a Workers entry point (`worker.js`) and a Wrangler configuration (`wrangler.jsonc`). The Worker serves the Vite `dist/` assets and handles `/api/*` requests.

1. Connect the GitHub repository to Workers Builds.
2. Use production branch `main` and root directory `/`.
3. Set the build command to `npm run build` and the deploy command to `npx wrangler deploy`.
4. Keep Cloudflare Access protection disabled for the public application unless you intentionally want a private app.
5. Test `https://YOUR-WORKER.workers.dev/api/health`.

The repository pins `npm@10.9.2`. GitHub Actions regenerates and commits the lockfile when needed, then tests with a clean `npm ci`, runs the test suite, builds the Vite app and performs a Wrangler dry-run.
