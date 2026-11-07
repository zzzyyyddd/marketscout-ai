# MarketScout AI — submission

**Tagline:** Pay once for an Instagram analytics snapshot. Recover the same report later.

- **Demo:** https://marketscout-ai-three.vercel.app
- **Recovery:** https://marketscout-ai-three.vercel.app/recover
- **GitHub:** https://github.com/zzzyyyddd/marketscout-ai

## Description

MarketScout AI turns a single x402 payment into a durable Instagram analytics snapshot. A user chooses an account, authorizes 0.005 USDC on Celo Mainnet and receives a report built from Instagram data returned by the gateway. The report is saved with its original generation timestamp. Later, the purchasing wallet can authenticate to recover that same snapshot without another payment or a fresh Instagram fetch.

The dashboard displays account metrics and, when the saved sample contains posts, engagement, top-performing posts, content mix and an interactive explorer. It explicitly marks missing post analytics as unavailable. The project demonstrates a payment-to-delivery workflow for paid data that remains useful after the original browser session.

## Technical explanation

- **Payment:** x402 v2 gateway offer, Celo Mainnet chain 42220, 0.005 USDC; a wallet creates an EIP-712 transfer authorization using `@celo/buy-core` and viem.
- **Verification:** The backend validates the offer and signature, atomically reserves the request, forwards it once, and verifies settlement against Celo transaction, receipt and event data before settling the ledger. Reservation, authorization nonce and transaction evidence provide duplicate and replay protection.
- **Delivery:** The gateway response is staged durably, normalized into descriptive analytics, stored with a generation timestamp and read back before the API reports successful delivery.
- **Recovery:** A domain-bound, short-lived wallet ownership challenge protects access to the original saved report. Recovery does not call the Instagram gateway or initiate a payment.
- **Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Celo, x402, `@celo/buy-core`, viem, Supabase PostgreSQL and Vercel.

## Evidence and judging

The operator reports a successful controlled Mainnet payment, report delivery and wallet-authenticated recovery of the same `@nike` snapshot. Its generation timestamp is `2026-11-07T12:39:39.884Z`. The saved report has 290,817,931 followers, 269 following and zero sampled posts, so post-level analytics are unavailable. The operator also reports verifying the updated recovery dashboard in production. See [evidence and qualification](evidence.md).

The production website and historical demonstration are public. Payment initiation is limited to the already-used controlled wallet, username and reservation; judges cannot purchase a new snapshot through the current gate. Recovery of the paid `@nike` report requires its purchasing wallet. Judges can browse the public historical example without a payment or wallet signature. The historical example is separate from the `@nike` purchase.

## Assets

- [Two-minute demo script](demo-script.md)
- [Test evidence](evidence.md)
- [Screenshot instructions](screenshots/README.md). No dashboard screenshots were found in the repository at preparation time.
