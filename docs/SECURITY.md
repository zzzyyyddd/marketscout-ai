# MarketScout AI security model

MarketScout AI is a hackathon application. The controls described here are implementation properties and operator procedures; no independent professional security audit is claimed.

## Payment protections

- The deployed payment gate defaults closed and, when configured for a controlled test, requires an exact payer, username and reservation. The server checks that scope before processing the payment authorization.
- The x402 offer and EIP-712 authorization are checked against the configured chain, token, recipient, amount and gateway resource. A signed authorization alone is not treated as settlement.
- An atomic database reservation records payment authorization metadata before the paid gateway request. Ledger constraints and settlement checks bind nonce, payer and transaction evidence to a reservation and reject replay or conflicting reuse.
- The gateway request is forwarded once; database write retries do not resend it. If the result is uncertain, the user should preserve the reservation and use recovery rather than pay again.
- A settled response is reported as successful only after the generated report has been stored and read back. A missing report is reported as unavailable or unresolved.

## Recovery protections

Recovery uses a short-lived, one-use ownership challenge bound to the domain, wallet and reservation. The backend validates the wallet signature and consumes the challenge before reading a paid report or resuming processing. Recovery does not ask the gateway for a new paid scan. Keep wallet secrets, signed payment payloads and recovery signatures private.

## What must be trusted

| Dependency | Risk or limitation |
| --- | --- |
| User wallet and browser | A compromised wallet or browser can expose authorizations or permit unwanted actions. A valid signature proves wallet authorization, not the quality of offchain data. |
| Instagram gateway | The provider can fail or return incomplete data. Redelivery of a response lost after payment has not been established. |
| Celo RPC and chain | Verification relies on configured RPC responses and the chain's transaction and receipt data; unavailable or inconsistent evidence leaves settlement unresolved. |
| Supabase and Vercel | Service credentials, database constraints and runtime configuration must remain protected. A staging or storage outage may prevent delivery even after payment. |
| Snapshot data | Reports are historical descriptive analyses. The `@nike` test snapshot has zero sampled posts, so post-level engagement is unavailable. |

## Operational boundaries

The current production quote is scoped to the completed controlled test. General public charging is not enabled. The Instagram gateway migration was reported applied in production; do not rerun migrations as part of judging. Recovery of an existing paid snapshot requires the purchasing wallet. A legacy payment without a saved report cannot be recovered as a snapshot.

Do not publish production secrets, wallet keys, signed authorizations, request headers or HAR files. Use GitHub's private vulnerability reporting for the repository if available, or contact the repository owner privately before publishing sensitive findings. Do not spend funds or modify production state to investigate a suspected issue without authorization.
