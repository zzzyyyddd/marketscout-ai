/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function load(file, dependencies, fetcher, env = { MARKETSCOUT_PUBLIC_PAYMENTS: 'true' }) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: loaded, exports: loaded.exports, Buffer, Response, Headers, AbortSignal, URL,
    process: { env },
    fetch: fetcher,
    require: name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name === 'server-only' || name === 'client-only') return {};
      // Dependencies may be imported, but no wallet, ledger or paid transport
      // function may be invoked when the real gate is closed.
      return new Proxy({}, { get: () => () => { throw new Error('Side effect forbidden: ' + name); } });
    },
  });
  return loaded.exports;
}

(async () => {
  const readiness = load('src/lib/public-payment-readiness.ts', {});
  assert.equal(readiness.publicPaymentsEnabled(), false, 'old environment true must not open the controlled gate');
  const dependencies = {
    '@/lib/public-payment-readiness': readiness,
    './public-payment-readiness': readiness,
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  };
  const execute = load('src/app/api/payment/execute/route.ts', dependencies);
  const result = await execute.POST({ text() { throw new Error('Must not read input'); } });
  assert.equal(result.status, 503);
  const orchestrator = load('src/lib/public-payment-orchestrator.ts', dependencies);
  await assert.rejects(orchestrator.executePublicPayment('', '', ''), /Public payments disabled/);
  const policy = load('src/lib/payment-mainnet-policy.ts', {}).MAINNET_PAYMENT_POLICY;
  const offer = { scheme: 'exact', network: policy.caip2Network, amount: '5000', asset: policy.allowedToken, payTo: policy.allowedPayTo, extra: { name: 'USDC', version: '2' } };
  const quote = load('src/app/api/payment/quote/route.ts', {
    ...dependencies,
    '@/lib/payment-network-config': { getPaymentNetworkConfig: () => policy },
  }, async (_url, options) => {
    assert.equal(options.method, 'GET');
    const challenge = { x402Version: 2, resource: { url: 'https://gateway.usebuy.ai/v1/social/instagram/profile' }, accepts: [offer] };
    return new Response(null, { status: 402, headers: { 'payment-required': Buffer.from(JSON.stringify(challenge)).toString('base64') } });
  });
  const response = await quote.GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).signingEnabled, false);
  const scope = { payer: '0x' + '12'.repeat(20), username: 'nike', reservationId: '11111111-1111-4111-8111-111111111111' };
  const env = {
    MARKETSCOUT_PUBLIC_PAYMENTS: 'true', MARKETSCOUT_CONTROLLED_TEST_ENABLED: 'true',
    MARKETSCOUT_CONTROLLED_TEST_PAYER: scope.payer,
    MARKETSCOUT_CONTROLLED_TEST_USERNAME: scope.username,
    MARKETSCOUT_CONTROLLED_TEST_RESERVATION_ID: scope.reservationId,
  };
  for (const key of Object.keys(env)) {
    const incomplete = { ...env }; delete incomplete[key];
    assert.equal(load('src/lib/public-payment-readiness.ts', {}, undefined, incomplete).publicPaymentsEnabled(), false);
  }
  for (const bad of [{ MARKETSCOUT_CONTROLLED_TEST_PAYER: '0x' + '0'.repeat(40) }, { MARKETSCOUT_CONTROLLED_TEST_USERNAME: '../nike' }, { MARKETSCOUT_CONTROLLED_TEST_RESERVATION_ID: 'not-a-uuid' }]) {
    assert.equal(load('src/lib/public-payment-readiness.ts', {}, undefined, { ...env, ...bad }).publicPaymentsEnabled(), false);
  }
  const enabled = load('src/lib/public-payment-readiness.ts', {}, undefined, env);
  assert.equal(enabled.publicPaymentsEnabled(), true);
  assert.doesNotThrow(() => enabled.assertControlledPaymentScope(scope.payer, scope.username, scope.reservationId));
  for (const args of [
    ['0x' + '34'.repeat(20), scope.username, scope.reservationId],
    [scope.payer, 'other', scope.reservationId],
    [scope.payer, scope.username, '22222222-2222-4222-8222-222222222222'],
    [scope.payer, scope.username, undefined],
  ]) {
    assert.throws(() => enabled.assertControlledPaymentScope(...args), /outside controlled/);
    const guarded = load('src/lib/public-payment-orchestrator.ts', { ...dependencies, './public-payment-readiness': enabled });
    await assert.rejects(guarded.executePublicPayment('unused', ...args), /outside controlled/);
  }
  const approvedQuote = { x402Version: 2, network: policy.caip2Network, chainId: 42220, token: policy.allowedToken, recipient: policy.allowedPayTo, amountAtomic: '5000', resource: 'https://gateway.usebuy.ai/v1/social/instagram/profile', accepted: { ...offer, maxTimeoutSeconds: 300 }, signingEnabled: true, controlledTest: scope };
  const validation = load('src/lib/public-payment-validation.ts', {
    viem: { isAddress: v => /^0x[0-9a-fA-F]{40}$/.test(v), getAddress: v => v.toLowerCase() },
    './payment-mainnet-policy': { MAINNET_PAYMENT_POLICY: policy },
  });
  const browser = load('src/lib/build-browser-public-payment.ts', { ...dependencies, './public-payment-validation': validation });
  await assert.rejects(browser.buildBrowserPublicPayment({ ...approvedQuote, signingEnabled: false }, 'nike'), /Public payments disabled/);
  await assert.rejects(browser.buildBrowserPublicPayment(approvedQuote, 'other'), /Public payments disabled/);
  assert.throws(() => validation.validatePublicPaymentQuote({ ...approvedQuote, controlledTest: null }), /Invalid controlled/);
  const wrongWallet = load('src/lib/build-browser-public-payment.ts', {
    ...dependencies, './public-payment-validation': validation,
    './public-payment-preflight': { checkPublicPaymentPreflight: async () => ({ payer: '0x' + '34'.repeat(20) }) },
  });
  await assert.rejects(wrongWallet.buildBrowserPublicPayment(approvedQuote, 'nike'), /approved test wallet/);
  const enabledQuote = load('src/app/api/payment/quote/route.ts', {
    ...dependencies,
    '@/lib/public-payment-readiness': enabled,
    '@/lib/payment-network-config': { getPaymentNetworkConfig: () => policy },
  }, async () => new Response(null, { status: 402, headers: { 'payment-required': Buffer.from(JSON.stringify({ x402Version: 2, resource: { url: approvedQuote.resource }, accepts: [offer] })).toString('base64') } }));
  const enabledData = await (await enabledQuote.GET()).json();
  assert.equal(enabledData.signingEnabled, true);
  assert.deepEqual(enabledData.controlledTest, scope);
  console.log('PASS default-closed and explicitly enabled gate; exact wallet/username/UUID scope; stale/disabled quotes; browser wrong-wallet refusal; enabled quote (no signing or payment)');
})().catch(error => { console.error(error); process.exitCode = 1; });
