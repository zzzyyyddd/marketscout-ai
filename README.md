# MarketScout AI

**Pay once for an Instagram analytics snapshot. Recover the same report later.**

MarketScout AI is a Celo and x402 demonstration built for the **Agents on Open Rails Hackathon 2026 — Build with buy**. A 0.005 USDC payment purchases one analysis snapshot for one Instagram username. The application retrieves profile data through an x402 gateway, generates descriptive analytics, and saves the report for wallet-authenticated recovery without a second payment. A new analysis is a separate purchase and may produce different data.

- **App:** https://marketscout-ai-three.vercel.app
- **Recovery:** https://marketscout-ai-three.vercel.app/recover
- **Source:** https://github.com/zzzyyyddd/marketscout-ai
- **Read-only judge guide:** [docs/JUDGE_GUIDE.md](docs/JUDGE_GUIDE.md)
- **Submission package:** [description](docs/submission/README.md) · [two-minute demo script](docs/submission/demo-script.md) · [evidence](docs/submission/evidence.md)

## Judge quick start

1. Open the [live app](https://marketscout-ai-three.vercel.app) and explore the public historical dashboard and post filters. No wallet or USDC is required.
2. Open the [recovery page](https://marketscout-ai-three.vercel.app/recover) to inspect the flow. The operator's paid `@nike` report can only be recovered by its purchasing wallet.
3. Review the [evidence matrix](#evidence), [architecture](docs/ARCHITECTURE.md) and [security model](docs/SECURITY.md). The [judge guide](docs/JUDGE_GUIDE.md) explains the complete three-minute path.

New payments are restricted to the completed controlled test; general public charging is not enabled. The landing-page historical example is distinct from the paid `@nike` snapshot.

## What the dashboard shows

The report displays the saved profile, followers, following, generation timestamp and the available sample. When posts are available, it also displays engagement, top posts, content mix and an interactive explorer. These are deterministic descriptive statistics, not LLM-generated predictions or live monitoring. Missing post data is shown as unavailable rather than zero engagement.

The public landing page also contains an existing historical demonstration snapshot. It is not the newly purchased `@nike` report.

## How the purchase and recovery work

1. The user enters an Instagram username and requests a quote. The backend validates the gateway's x402 v2 offer against the permitted Celo Mainnet network, USDC token, recipient, amount and resource.
2. The wallet signs an EIP-712 USDC `TransferWithAuthorization` for **0.005 USDC** on Celo Mainnet (chain ID **42220**). A signature alone is not settlement.
3. The backend checks the authorization and controlled release scope, reserves the request and forwards the payment to the gateway once. The ledger binds the reservation to the payer, authorization and username, with replay and duplicate protections.
4. The backend stages the gateway response and transaction evidence, verifies settlement against Celo transaction and receipt data, generates a report from the returned Instagram data, and saves it. Success requires a saved-report readback.
5. Recovery uses a time-limited, domain-bound wallet ownership challenge. The same wallet signs a recovery message; the backend returns the saved snapshot and its original `generatedAt` timestamp without fetching Instagram again or charging again.

If delivery is uncertain, preserve the reservation and use recovery rather than initiating another payment. Gateway redelivery after a lost paid response is not established; a paid request whose response is lost may remain unrecoverable.

## Evidence

| Case | Evidence | What it shows | Limits |
| --- | --- | --- | --- |
| Celo Sepolia | [Testnet transaction](https://celo-sepolia.blockscout.com/tx/0xe02aa5ce58a261683e062d22c62f67c567f0aead9617f073ff8dea73609f7f92) | Historical testnet payment; the explorer reports success. | Testnet USDC; not the November 7 purchase. |
| November 6 Celo Mainnet | [Earlier Mainnet transaction](https://celoscan.io/tx/0x96332992ef8c33f2e7fc1e2f2bd63cfd4cb0eba81fd90fe51b06f7340c916f31) | A read-only Celo RPC check accepted the 0.005 USDC transaction, receipt, calldata and logs at block 82034610. | Its report was not delivered; no reservation or response binding was verified. |
| November 7 controlled test | [Operator-reported evidence](docs/submission/evidence.md) | The operator reports a 0.005 USDC payment, `@nike` report delivery and recovery of the same snapshot without another payment. | The transaction hash and response-only receipt were not supplied for independent verification. |

The operator reports that one **0.005 USDC** payment for `@nike` delivered a report and that wallet-authenticated recovery returned the same saved snapshot without another payment. The original generation timestamp was **2026-11-07T12:39:39.884Z**. The recovered snapshot contained **290,817,931 followers**, **269 following** and **0 sampled posts**. Post-level engagement and content analysis are unavailable for that snapshot. The operator also reports testing the updated recovery dashboard in production after commit `e95e777`.

These are operator-reported observations; the transaction hash and response-only receipt have not been supplied for independent inspection. See [test evidence and limits](docs/submission/evidence.md).

### Screenshots

No real screenshots are currently present in the repository. The numbered [evidence gallery](docs/screenshots/README.md) lists the exact filenames for genuine captures; it does not substitute mock data for evidence.

## Availability and safety

The app and its non-payment features are public. **General public charging is not enabled.** The current controlled gate is configured for one wallet, `nike` and the single fixed reservation used for the test; a successful purchase consumes that reservation. Judges should not expect to purchase a new report or recover the operator's report with a different wallet. No payment or wallet signature is needed to explore the public historical demonstration.

The deployed server checks the payer, username and reservation before forwarding a payment. Supabase-backed reservation and settlement checks provide replay protection and a daily spending cap. Recovery requires the purchasing wallet. Legacy payments without a saved report cannot be recovered as snapshots.

## Architecture and technology

Next.js 16 and React 19 provide the dashboard and API routes; TypeScript implements the x402 flow with `@celo/buy-core` and viem. Celo Mainnet USDC settles payment, Supabase PostgreSQL stores payment evidence and reports, and Vercel hosts the application. The Instagram gateway supplies the profile data.

Read the [architecture](docs/ARCHITECTURE.md) for trust boundaries and the [security model](docs/SECURITY.md) for failure handling and reporting guidance. No independent security audit is claimed.

## Run locally

Requirements: Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The historical demonstration does not require payment credentials. Production payment and database credentials are server-side and must never be committed.

Focused checks:

```sh
node scripts/test-report-dashboard.cjs
node scripts/test-paid-workflow.cjs
npx tsc --noEmit
npx next build --webpack
```

The workflow tests use mocked payment, wallet and database dependencies; they do not prove a real payment or report delivery. The Webpack build is also the configured Vercel build path. See the [controlled test procedure](docs/controlled-mainnet-test.md) for operational details.

## License

[MIT](LICENSE).
