# MarketScout AI

**Onchain-paid social intelligence powered by Celo and x402.**

Built for **Agents on Open Rails Hackathon 2026 — Build with buy**.

MarketScout AI demonstrates an agent-oriented workflow for purchasing external social data through x402, analyzing competitor content, and presenting actionable performance insights.

## Features

- Instagram competitor profile intelligence
- Interactive explorer with filtering and sorting
- Engagement metrics and top-performing posts
- Video versus non-video comparison
- x402 integration using `@celo/buy-core`
- Celo USDC payment support
- Strict payment network, token, recipient, and URL validation
- Per-request and daily spending limits
- Supabase-backed payment accounting

## Technology

Next.js 16, React 19, TypeScript, Celo, x402, @celo/buy-core, Supabase PostgreSQL, and Vercel.

## Architecture

1. Request Instagram competitor data
2. Gateway responds with HTTP 402
3. SDK selects an allowed Celo USDC payment offer
4. Payment policy validates network, token, recipient, URL, and amount
5. Spending ledger reserves the payment budget
6. Payment authorization enables access to the data
7. Data is normalized and analyzed
8. Dashboard presents competitor insights

This describes the implemented payment workflow. A real Celo Mainnet payment has been verified, although successful report delivery remains unverified.

## Current Dashboard

The dashboard uses a historical x402 sandbox snapshot containing 12 Instagram posts.

Users can explore engagement statistics, compare content formats, sort posts, and inspect caption previews.

Current analytics are deterministic descriptive statistics, not LLM-generated analysis.

## Verified Celo Sepolia x402 Payment

A real x402 request succeeded on Celo Sepolia.

- Network: Celo Sepolia
- Asset: testnet USDC
- Payment: 0.005 USDC
- HTTP response: 200
- Transaction: https://celo-sepolia.blockscout.com/tx/0xe02aa5ce58a261683e062d22c62f67c567f0aead9617f073ff8dea73609f7f92

This is testnet evidence, not a mainnet payment.

## Celo Mainnet Readiness

- Mainnet HTTP 402 gateway offer discovered
- Mainnet USDC offer selected successfully by the SDK
- Mainnet payment policy: 12/12 tests passed
- Sepolia payment policy: 10/10 tests passed
- Mainnet payment settlement: verified (0.005 USDC)
- Mainnet report delivery: not completed for the verified transaction

The public payment execution route integrates Mainnet payment verification and paid-report storage.

## Security

- Environment variables for sensitive configuration
- Local `.env.local` excluded from Git
- Strict payment destination and asset allowlists
- Maximum payment per request: 0.005 USDC
- Daily spending reservation cap: 0.05 USDC
- Supabase RPC payment reservation and settlement
- No automatic retry after an uncertain paid request
- No automatic payment retry after uncertain settlement

## Local Development

Requirements: Node.js 22 or newer.

Install dependencies:

    npm ci

Start the development server:

    npm run dev

Open http://localhost:3000.

The snapshot dashboard does not require live payment credentials.

## Tests

Production build:

    npm run build

Payment policy tests:

    node scripts/test-payment-policy.mjs
    node scripts/test-mainnet-payment-policy.mjs

SDK selection tests:

    node scripts/test-x402-selection.mjs
    node scripts/test-mainnet-selection.mjs

The mainnet selection test obtains a free HTTP 402 challenge without making a payment.

## Deployment

Import the GitHub repository into Vercel as a Next.js project.

The dashboard is statically generated and can be hosted without running a local laptop.

Production includes the payment execution and report recovery routes.

## Current Limitations

- Historical snapshot rather than live public scans
- Descriptive analytics rather than LLM-generated insights
- Mainnet payment settlement verified, but its report was not delivered
- Complete production payment-to-report delivery remains unverified
- Legacy payments without stored reports cannot use the recovery workflow

## License

Not yet specified.


## Verified Celo Mainnet Payment

A real payment of 0.005 USDC settled on Celo Mainnet.

Transaction:
https://celoscan.io/tx/0x96332992ef8c33f2e7fc1e2f2bd63cfd4cb0eba81fd90fe51b06f7340c916f31

The associated report was not delivered. This transaction demonstrates payment settlement, not successful end-to-end delivery.

## Paid Report Recovery

Recovery page:
https://marketscout-ai-three.vercel.app/recover

The implemented workflow uses wallet ownership signatures, time-limited challenges, payment matching, and replay protection.

Sandbox database integration tests passed all four checks: challenge issuance, wrong-wallet rejection, report retrieval, and replay rejection.

Complete production HTTP recovery has not been verified end-to-end. Recovery requires a previously stored report.
