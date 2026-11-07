# Controlled Mainnet test evidence

## Evidence matrix

| Case | Evidence | What it supports | Boundary |
| --- | --- | --- | --- |
| Celo Sepolia | [Explorer transaction](https://celo-sepolia.blockscout.com/tx/0xe02aa5ce58a261683e062d22c62f67c567f0aead9617f073ff8dea73609f7f92) | Historical testnet transaction shown as successful by the explorer. | Testnet USDC; separate from the November 7 Mainnet purchase. |
| November 6 Mainnet | [Earlier transaction](https://celoscan.io/tx/0x96332992ef8c33f2e7fc1e2f2bd63cfd4cb0eba81fd90fe51b06f7340c916f31) | Read-only Celo RPC verification accepted the 0.005 USDC transaction, canonical receipt, calldata and logs at block 82034610. | No delivered report, reservation binding or Instagram response was verified for that transaction. |
| November 7 Mainnet | Operator observations below. | The operator reports payment, report delivery and authenticated recovery of the same snapshot. | No transaction hash or response-only receipt was supplied for independent verification of this purchase. |

## Operator-reported observations

| Item | Reported result |
| --- | --- |
| Network and amount | Celo Mainnet, 0.005 USDC |
| Instagram account | `nike` |
| Reservation | `7f6b96ef-75ec-41a9-8b94-d9191f5e419f` |
| Delivery | Paid Instagram report displayed |
| Recovery | The purchasing wallet authenticated; the same saved snapshot was returned without a second payment |
| Snapshot generation time | `2026-11-07T12:39:39.884Z` |
| Recovered profile metrics | 290,817,931 followers; 269 following; 0 sampled posts |
| Recovery dashboard | Operator reports successful production verification after deployment `e95e777` |

The agent has not been given the transaction hash or response-only receipt for this purchase and has not independently verified the transaction or performed a wallet-authenticated recovery. Do not substitute a different historical transaction as proof of this purchase. Automated payment and recovery tests use mocks and are not evidence of funded delivery.

Zero sampled posts means post-level engagement, top-post ranking and content mix cannot be measured for this snapshot. The report is a historical snapshot, not a live subscription or an automatically refreshed scan.

## Read-only production checks

On 2026-11-07 the production quote returned x402 v2, Celo chain 42220 and 5000 atomic USDC, with signing enabled only for the configured controlled wallet, `nike` and the reservation above. The production app and recovery page were accessible. The deployed gate requires the controlled scope; unrestricted public charging was not enabled during preparation.

The original provider's ability to redeliver a lost paid response without another charge remains unverified. If the original gateway body is lost before durable staging, recovery may be unable to reconstruct the report. Do not start a second payment to work around an uncertain result.
