# Proof of Balance

A Binance Spot verification app with two Primus zkTLS templates:

1. **7-Day Spot Account PnL Rate**
2. **Spot Trade History**

The app uses Primus' enterprise zkTLS JavaScript SDK. It does **not** connect a crypto wallet, request wallet signatures, submit blockchain transactions or require gas. The user signs in to Binance in the same browser and uses the Primus browser extension to complete an attestation.

## Binance templates

The Binance tab contains a template chooser. Open either template to review its details. Each detail page has a **Back** control to return to the chooser.

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

### Spot Trade History

| Field | Value |
| --- | --- |
| Description | Verify the user’s 30-day spot trade history on Binance. |
| Template ID | `c25c9f6a-b816-4a67-86ab-7292eff209a3` |
| Data source URL | https://www.binance.com/en/my/orders/exchange/usertrade |
| Request URL | https://www.binance.com/bapi/capital/v1/private/streamer/trade/get-user-trades |
| Data item | `data` |
| JSONPath | `$.data` |

The app displays the returned `data` value as JSON. The app displays the returned `data` value without inferring or changing the covered time range.

## How to use it

1. Install and enable the Primus browser extension (version 0.3.44 or later).
2. Open the app and choose either Binance template.
3. Select **Connect Binance**. The app opens the selected Binance account page in a new tab; sign in there if prompted. Your Binance password is entered only on Binance.
4. Return to the app and select **Verify trading history** (or **Verify PnL rate** for the PnL template). The Primus extension generates the attestation using the authenticated Binance browser session; the app then locally verifies the Primus signature.
5. Review the selected template field and the full attested response. Select **Back** to choose the other template.

The app cannot read Binance login state directly across sites. Opening the Binance page does not itself prove that you are signed in; complete Binance sign-in before starting the attestation.

No wallet or blockchain transaction is required.

## Wallet-free Primus architecture

This app uses the **Primus enterprise zkTLS SDK** `@primuslabs/zktls-js-sdk` (version range `^0.3.15`), rather than the Primus Network DApp SDK `@primuslabs/network-js-sdk`.

- Browser: initialises the SDK using the public App ID, constructs the request for the selected template, calls the server signing endpoint, completes the extension-based attestation and verifies the returned Primus signature.
- Server: uses `ZKTLS_APP_ID` and `ZKTLS_APP_SECRET` to sign the request. The App Secret never reaches the browser.
- Recipient: the app uses Primus' neutral zero-address default as an identifier. This does not represent or prove control of a wallet.
- No wallet provider, wallet connection, private key, transaction approval, blockchain task submission or gas payment is used.

The signing endpoint is restricted to the two configured template IDs, the app's own App ID, the neutral recipient identifier and the expected TLS mode. It also applies a request-size limit and rate limiting where a Cloudflare KV rate-limit binding is configured.

Official references:
- [Primus zkTLS JS SDK](https://github.com/primus-labs/zktls-js-sdk)
- [Primus wallet-free enterprise SDK integration guide](https://github.com/primus-labs/skills/tree/main/primus-zktls-js-sdk-dapp)
- [Primus production integration demo](https://github.com/primus-labs/zktls-demo/tree/main/production-example)
- [Primus Developer Hub](https://dev.primuslabs.xyz/)
- [Primus browser extension](https://chromewebstore.google.com/detail/primus-prev-pado/oeiomhmbaapihbilkfkhmlajkeegnjhe)

## Requirements

- Node.js 20 or newer and npm
- Primus Developer Hub App ID and App Secret
- Primus browser extension version 0.3.44 or later
- A Binance account signed in to the same browser

## Configuration

The server requires these values:

```env
ZKTLS_APP_ID=your_primus_app_id
ZKTLS_APP_SECRET=your_primus_app_secret
```

For Cloudflare Workers, add both under **Workers & Pages → proof-of-balance → Settings → Variables and Secrets** as encrypted secrets. The app returns only the public App ID to the browser. Never expose or commit the App Secret.

For local development, copy `.env.example` to `.env` and fill in the same two values.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

For checks and a production build:

```bash
npm test
npm run build
```

The Express development server serves the API routes; the Cloudflare Worker serves the built Vite assets and handles `/api/*`.

## API

- `GET /api/health` — application status and whether Primus server credentials are configured.
- `GET /api/primus/config` — returns the public Primus App ID only.
- `POST /api/primus/sign` — validates and signs a request for one of the two allowlisted templates. The App Secret is used server-side and is never returned.

The old public-wallet lookup and server-side Binance API-key balance routes have been removed.

## Proof boundaries and privacy

- A successful result means the attestation signature passed the Primus SDK's local verification and the selected template data item was present in the returned attestation.
- The app does not infer a percentage unit, change data values or independently validate Binance's business interpretation of the time period.
- The zero address is a neutral identifier required by the SDK format; it is not an account connection or a proof of wallet ownership.
- The enterprise SDK integration uses Primus' proprietary attestor rather than the decentralized Primus Network task-submission flow.
- The Binance source pages are account-specific and require the user to be signed in to Binance in the same browser.

## Deploy to Cloudflare Workers

This repository includes a Workers entry point (`worker.js`) and a Wrangler configuration (`wrangler.jsonc`). The Worker serves the Vite `dist/` assets and handles the Primus API routes.

1. Connect the GitHub repository to Workers Builds.
2. Use production branch `main` and root directory `/`.
3. Set the build command to `npm run build` and the deploy command to `npx wrangler deploy`.
4. Add `ZKTLS_APP_ID` and `ZKTLS_APP_SECRET` as encrypted Worker secrets.
5. Test `https://YOUR-WORKER.workers.dev/api/health` and confirm `primusConfigured: true`.

The repository pins `npm@10.9.2`. GitHub Actions regenerates and commits the lockfile when needed, then tests with a clean `npm ci`, runs the test suite, builds the Vite app and performs a Wrangler dry-run.
