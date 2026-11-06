# One controlled Celo Mainnet snapshot test

Preparation is authorized. No payment has been executed and E2E is not yet proven.
The operator accepted the possible loss of 0.005 USDC if the gateway result is lost.
Each purchase is one immutable saved snapshot, not a subscription or an automatically
refreshed report. Public launch remains outside this controlled test.

## Deployment files

Include the changed production source, `vercel.json`, `package.json`, this procedure,
README and the focused offline test files. The exact selective commit is the release
manifest; exclude all SQL drafts/migrations, backups, credentials, temporary captures
and unrelated rehearsal/evidence scripts. The existing production gateway migration
is already applied. Do not run any migration or database preparation.

Runtime changes:

- `src/lib/public-payment-readiness.ts`: default-closed server gate; exact wallet,
  username and fixed UUID for one controlled attempt.
- `src/app/api/payment/{quote,execute}/route.ts`: scoped offer/execution; 300s budget.
- `src/lib/{public-payment-validation,prepare-public-payment,build-browser-public-payment}.ts`:
  validate the quote/scope and approved wallet before requesting payment authorization.
- `src/lib/{public-payment-gateway-relay,public-payment-orchestrator,paid-response-store,paid-report-store,report}.ts`:
  165s relay, durable processing, immutable snapshot timestamp and readable saved report.
- `src/app/api/report-recovery/route.ts`, `src/app/recover/page.tsx`:
  authenticated exact saved snapshot recovery independent of new-payment enablement.
- `src/app/{username-search,public-payment-panel,competitor-dashboard}.tsx`:
  manual purchase, receipt/recovery link, one-attempt lock and generation-time labeling.

## Vercel configuration: first deploy CLOSED

Keep existing production `SUPABASE_URL` and `SUPABASE_SECRET_KEY` unchanged and
server-only. Existing admin configuration may remain; no backend wallet private key
or NEXT_PUBLIC payment enable flag is required for this browser-authorized path.

| Variable | Closed verification deployment | Controlled test, only after verification/authorization |
| --- | --- | --- |
| `MARKETSCOUT_PUBLIC_PAYMENTS` | `false` or unset | `true` |
| `MARKETSCOUT_CONTROLLED_TEST_ENABLED` | `false` or unset | `true` |
| `MARKETSCOUT_CONTROLLED_TEST_PAYER` | unset | exact public address of the operator's test wallet |
| `MARKETSCOUT_CONTROLLED_TEST_USERNAME` | unset | `nike` |
| `MARKETSCOUT_CONTROLLED_TEST_RESERVATION_ID` | unset | `7f6b96ef-75ec-41a9-8b94-d9191f5e419f` |
| `MARKETSCOUT_RECOVERY_ENABLED` | unset or `true` | unchanged: unset or `true` |
| `MARKETSCOUT_ENABLE_PAYMENTS` | `false` or unset | unchanged: `false` or unset |

The newly introduced controlled-test flag defaults false, so the old public enable
flag alone cannot open the new release. No environment setting was changed during
preparation. Do not change the fixed UUID to bypass a consumed/uncertain test slot.
That UUID has only been generated locally; no reservation was created for it.

`vercel.json` selects Next.js and `npx next build --webpack`. Use the current project
root (the directory containing package.json), `npm ci`, and the default Next output.
The route exports `maxDuration = 300`. Confirm the deployed function actually has
300 seconds available. Fluid Compute supports this budget without a plan upgrade;
if this project's runtime enforces less, stop rather than testing on that limit.
[Vercel duration documentation](https://vercel.com/docs/functions/configuring-functions/duration).

An authorized push to main triggers the existing Git integration. Verify the commit,
Vercel Ready state and production alias before interacting with any wallet. Closed
smokes: GET quote is 200 with signingEnabled false and controlledTest null; POST
execute with `{}` is 503; unauthenticated scan is 401; `/recover` is 200; malformed
report recovery is rejected without issuing a challenge. No valid payment payload
or challenge issuance is part of these smoke tests.

To open the controlled test later: obtain the operator's public wallet address and
explicit test authorization, set only the scoped variables in the table, and redeploy
the SAME reviewed source. Vercel environment changes apply to new deployments, not
existing ones. [Environment documentation](https://vercel.com/docs/environment-variables).
Verify Ready/commit again, then GET quote: signingEnabled true and controlledTest
exactly matches wallet, nike and the fixed UUID. This GET does not pay or reserve.
No further code change is needed to open the gate. Never enable just an unrestricted
public payment flag or publish a reusable payment authorization.

## Exact manual browser test

1. Use a desktop browser with MetaMask or Rabby, one tab and the approved wallet.
   Have at least 0.005 native Celo USDC (contract
   `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`). Switch to Celo Mainnet, chain
   42220. No token approval transaction or server wallet is needed for x402.
2. Open https://marketscout-ai-three.vercel.app after the approved enabled deployment
   is Ready. Connect Wallet, select exactly the configured account, and verify chain.
   Do not clear any pending/uncertain purchase marker. If an old marker exists, use
   a separate browser profile for this new test while preserving the old record.
3. Enter `nike`. Optionally view its saved lookup; this is not the paid snapshot.
   Click **Pay 0.005 USDC & Analyze** once. The browser confirmation must name nike,
   0.005 USDC, Celo Mainnet and recipient
   `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`.
4. Review the wallet's EIP-712 TransferWithAuthorization: chain 42220, USDC contract
   above, recipient above, value 5000, a nonce and a short expiration. Approve exactly
   once only if these match. Stop on any different amount/token/recipient/transaction.
   This is the sole payment authorization; the agent never performs it.
5. Leave the tab open. The gateway wait may take up to 165 seconds; server processing
   has a 300-second budget. Do not click again, refresh while pending, or resubmit a
   POST after a network error. The backend sends the paid request at most once per
   reservation; the existing unique primary key prevents a second forwarding even
   with a fresh authorization or another browser tab.
6. On success, verify the visible account is nike and the report has a **Snapshot
   generated** ISO timestamp. Record the fixed reservation UUID, transaction hash,
   generation timestamp and report contents. The execute response must be HTTP 200,
   status settled, chain celo and a valid report. Do not export request headers or a
   HAR containing the payment authorization. Use response-only evidence if needed.
7. Confirm the transaction on Celo and record its hash. The server's success path
   requires exact on-chain evidence, verified settlement, report persistence and
   saved-report readback. Do not infer report delivery solely from the explorer.
8. Reload the page. Use **Recover payment / report — no new payment**, or open
   `/recover?reservation=7f6b96ef-75ec-41a9-8b94-d9191f5e419f`. Use the same wallet.
   Click **Sign & Recover Report** and manually approve only the MarketScout
   ownership/recovery message for this domain and reservation—not another USDC
   authorization. Verify the response is recovered with the exact same saved
   report, generation timestamp and metrics. Recovery never fetches Instagram again.
9. Close/reopen the browser and repeat step 8. A manual reservation URL works even
   without browser storage. The old historical demo may appear on the landing page;
   it is not a replacement for the purchased snapshot. The recovery page displays
   the exact saved snapshot JSON and its original generation timestamp.
10. Record E2E PASS only after immediate real report delivery AND authenticated
    recovery of the same snapshot. Disable the two payment enable flags and redeploy
    the same source after the attempt; leave recovery enabled and preserve all data.
    The spent fixed UUID prevents another paid forwarding even before closure.

## Failure handling

- HTTP 202, timeout, a rejected execution response, or missing report is not E2E PASS.
  Preserve the reservation and any transaction hash. Do not clear the browser lock,
  start a new purchase, change the controlled UUID or sign another payment.
- Recover using a fresh ownership challenge for the SAME reservation. If the original
  body is staged, the backend can resume verification/processing without another
  gateway request. If the final report already exists, it returns it unchanged.
- If no original body survived, no local method can fabricate it or safely purchase
  a substitute under the original charge. Record the failure and stop; the operator
  has accepted this risk. Provider redelivery remains undocumented and no refund
  promise is made. No provider contact is required for this risk-accepted test.
- A pre-payment budget/reservation failure may prevent the test without spending.
  Investigate before any separately authorized action; do not automatically retry.
- A new snapshot of the same username is a separate future purchase with a distinct
  reservation/authorization. It does not overwrite this saved snapshot. This controlled
  release intentionally permits only the single configured attempt.
