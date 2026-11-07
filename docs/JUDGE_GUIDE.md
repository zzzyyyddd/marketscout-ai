# MarketScout AI — judge guide

**Paid Instagram snapshots on Celo Mainnet, with wallet-authenticated recovery**

MarketScout AI turns a single 0.005 USDC x402 payment into a saved Instagram analytics snapshot. Each purchase is for one username and one snapshot; it is not a subscription. The purchasing wallet can recover the saved report without another payment or a fresh Instagram request.

## Quick links

| Resource | Link |
| --- | --- |
| Public application and historical demo | [marketscout-ai-three.vercel.app](https://marketscout-ai-three.vercel.app) |
| Recovery interface | [Open recovery](https://marketscout-ai-three.vercel.app/recover) |
| Read-only payment quote | [View x402 quote](https://marketscout-ai-three.vercel.app/api/payment/quote) |
| Source | [github.com/zzzyyyddd/marketscout-ai](https://github.com/zzzyyyddd/marketscout-ai) |
| Technical details | [Architecture](ARCHITECTURE.md) · [Security model](SECURITY.md) |
| Submission | [Description](submission/README.md) · [Demo script](submission/demo-script.md) · [Evidence](submission/evidence.md) |

## Three-minute read-only judging path

1. **Open the [live app](https://marketscout-ai-three.vercel.app).** Explore the default historical snapshot and its post filters. This demonstration is separate from the paid `@nike` report. No wallet connection or payment is needed.
2. **Visit [recovery](https://marketscout-ai-three.vercel.app/recover).** Inspect the reservation input and the wallet-authentication explanation. The operator's paid report is private to the purchasing wallet; another wallet cannot recover it. Do not sign a message to inspect the page.
3. **Inspect the [quote](https://marketscout-ai-three.vercel.app/api/payment/quote).** It is a read-only endpoint showing x402 version, Celo chain ID 42220, amount 5000 atomic USDC and the controlled scope. It does not reserve or charge a payment.
4. **Read the [evidence matrix](#evidence-matrix) and [security limits](SECURITY.md).** The production gate is restricted to the already-used test wallet, `nike` and the fixed reservation. Judges cannot purchase a new report through the current configuration.

## Evidence matrix

| Case | Evidence | What it establishes | Boundary |
| --- | --- | --- | --- |
| Celo Sepolia | [Testnet transaction](https://celo-sepolia.blockscout.com/tx/0xe02aa5ce58a261683e062d22c62f67c567f0aead9617f073ff8dea73609f7f92) | The explorer shows a successful historical testnet transaction. | Testnet funds; not evidence for the November 7 Mainnet purchase. |
| November 6 Mainnet | [Earlier Mainnet transaction](https://celoscan.io/tx/0x96332992ef8c33f2e7fc1e2f2bd63cfd4cb0eba81fd90fe51b06f7340c916f31) | A read-only Celo RPC check on November 7 accepted the transaction, canonical receipt, calldata and logs for 0.005 USDC at block 82034610. | Its report was not delivered; the check did not establish a report or reservation binding. |
| November 7 Mainnet | [Operator-reported controlled test](submission/evidence.md) | The operator reports payment, `@nike` report delivery, and wallet-authenticated recovery of the same snapshot without another payment. | No transaction hash or response-only receipt was supplied for independent verification of this purchase. |

The operator reports that the recovered `@nike` snapshot was generated at **2026-11-07T12:39:39.884Z**, with **290,817,931 followers**, **269 following** and **0 sampled posts**. The operator also reports successfully viewing the updated recovery dashboard after production deployment `e95e777`. Because no posts were sampled, post-level engagement and content analytics are unavailable; the dashboard should not imply measured zero engagement.

## How it works

The frontend obtains an x402 v2 offer and prompts the wallet for an EIP-712 USDC transfer authorization on Celo Mainnet. The server validates the offer, signature and configured scope, atomically reserves the request, and forwards it once to the Instagram gateway. It stages the gateway response and transaction evidence when available, checks onchain settlement, generates a report from the received data, and reads the saved snapshot before reporting success.

For recovery, the server issues a short-lived challenge bound to the domain, wallet and reservation. A valid wallet signature consumes the challenge and authorizes retrieval of the saved report. Recovery does not initiate a USDC transfer or repeat the gateway purchase. See [architecture](ARCHITECTURE.md) for the full flow.

## Limitations and visual evidence

- The paid test is operator-reported; its transaction hash was not provided for independent inspection.
- The `@nike` snapshot has zero sampled posts, so its post-level analytics are unavailable.
- A lost gateway response after settlement can leave a payment without a recoverable report; no provider redelivery guarantee has been established.
- No repository screenshots were available at preparation time. The numbered [screenshot gallery](screenshots/README.md) lists exact destinations for genuine captures.
- Reports are deterministic descriptive analytics, not AI-generated predictions or live monitoring. No independent professional security audit is claimed.
